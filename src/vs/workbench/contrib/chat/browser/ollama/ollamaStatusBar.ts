/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dark Matter IDE Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from '../../../../services/statusbar/browser/statusbar.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { localize2 } from '../../../../../nls.js';
import { OllamaLanguageModelProvider } from './ollamaLanguageModel.js';

const CONFIGURE_OLLAMA_CMD = 'workbench.action.configureOllama';

/**
 * Command that opens the Ollama quick-pick configuration dialog.
 */
class ConfigureOllamaAction extends Action2 {
	static readonly ID = CONFIGURE_OLLAMA_CMD;

	constructor() {
		super({
			id: ConfigureOllamaAction.ID,
			title: localize2('configureOllama', "Configure AI Server"),
			f1: true,
			category: localize2('ai', "AI"),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const configService = accessor.get(IConfigurationService);
		const logService = accessor.get(ILogService);

		const currentUrl = configService.getValue<string>('ollamaAgent.baseUrl') || 'http://127.0.0.1:11434';
		const currentModel = configService.getValue<string>('ollamaAgent.model') || 'llama3.1';
		const currentContext = configService.getValue<number>('ollamaAgent.maxContextWindow') || 131072;

		// Step 1: Pick what to configure
		const options: IQuickPickItem[] = [
			{
				id: 'url',
				label: '$(globe) Server URL',
				description: currentUrl,
				detail: 'Change the Ollama API server address',
			},
			{
				id: 'model',
				label: '$(symbol-method) Default Model',
				description: currentModel,
				detail: 'Select the default model for new chat sessions',
			},
			{
				id: 'context',
				label: '$(history) Context Window',
				description: `${(currentContext / 1024).toFixed(0)}k tokens`,
				detail: 'Adjust the maximum AI memory (impacts GPU VRAM)',
			},
			{
				id: 'test',
				label: '$(debug-start) Test Connection',
				detail: 'Verify the Ollama server is reachable',
			},
		];

		const picked = await quickInputService.pick(options, {
			title: 'AI Server Settings',
			placeHolder: 'Choose what to configure',
		});

		if (!picked) {
			return;
		}

		if (picked.id === 'url') {
			// URL input
			const newUrl = await quickInputService.input({
				title: 'Ollama Server URL',
				value: currentUrl,
				prompt: 'Enter the base URL of your Ollama server (e.g., http://192.168.1.100:11434)',
				validateInput: async (value) => {
					try {
						new URL(value);
						return undefined; // valid
					} catch {
						return 'Please enter a valid URL (e.g., http://127.0.0.1:11434)';
					}
				},
			});

			if (newUrl && newUrl !== currentUrl) {
				await configService.updateValue('ollamaAgent.baseUrl', newUrl);
				logService.info(`[Dark Matter] Ollama server URL updated to: ${newUrl}`);
			}

		} else if (picked.id === 'model') {
			// Fetch models from server and let user pick
			const baseUrl = configService.getValue<string>('ollamaAgent.baseUrl') || 'http://127.0.0.1:11434';

			let models: { name: string; size: number }[] = [];
			try {
				const response = await fetch(`${baseUrl}/api/tags`);
				if (response.ok) {
					const data = await response.json();
					models = data.models || [];
				}
			} catch {
				// connection failed
			}

			if (models.length === 0) {
				await quickInputService.pick(
					[{ label: '$(warning) Could not connect to Ollama server', description: baseUrl }],
					{ title: 'No Models Found' }
				);
				return;
			}

			const modelItems: IQuickPickItem[] = models.map(m => ({
				id: m.name,
				label: m.name === currentModel ? `$(check) ${m.name}` : `     ${m.name}`,
				description: m.name === currentModel ? 'current default' : '',
				detail: `Size: ${(m.size / (1024 * 1024 * 1024)).toFixed(1)} GB`,
			}));

			const selectedModel = await quickInputService.pick(modelItems, {
				title: 'Select Default Model',
				placeHolder: 'Choose a model to use by default',
			});

			if (selectedModel?.id && selectedModel.id !== currentModel) {
				await configService.updateValue('ollamaAgent.model', selectedModel.id);
				logService.info(`[Dark Matter] Default model updated to: ${selectedModel.id}`);
			}

		} else if (picked.id === 'context') {
			// Context window input
			const newContextStr = await quickInputService.input({
				title: 'Maximum Context Window',
				value: `${currentContext}`,
				prompt: 'Enter the maximum number of tokens (e.g., 32768, 131072, 262144). Affects GPU VRAM usage.',
				validateInput: async (value) => {
					const num = parseInt(value);
					if (isNaN(num) || num < 2048 || num > 262144) {
						return 'Please enter a number between 2048 and 262144';
					}
					return undefined;
				},
			});

			if (newContextStr) {
				const newContext = parseInt(newContextStr);
				if (newContext !== currentContext) {
					await configService.updateValue('ollamaAgent.maxContextWindow', newContext);
					logService.info(`[Dark Matter] Max context window updated to: ${newContext}`);
				}
			}

		} else if (picked.id === 'test') {
			// Test connection
			const baseUrl = configService.getValue<string>('ollamaAgent.baseUrl') || 'http://127.0.0.1:11434';

			try {
				const response = await fetch(`${baseUrl}/api/tags`);
				if (response.ok) {
					const data = await response.json();
					const modelCount = data.models?.length || 0;
					await quickInputService.pick(
						[{
							label: `$(check) Connected to ${baseUrl}`,
							detail: `${modelCount} model${modelCount !== 1 ? 's' : ''} available`,
						}],
						{ title: 'Connection Successful' }
					);
				} else {
					await quickInputService.pick(
						[{ label: `$(error) Server returned ${response.status}`, description: baseUrl }],
						{ title: 'Connection Failed' }
					);
				}
			} catch (err) {
				await quickInputService.pick(
					[{
						label: '$(error) Could not connect',
						detail: `${err}`,
						description: baseUrl,
					}],
					{ title: 'Connection Failed' }
				);
			}
		}
	}
}

// Register the command
registerAction2(ConfigureOllamaAction);

/**
 * Status bar entry showing current AI server status with quick config access.
 */
export class OllamaStatusBarEntry extends Disposable {

	static readonly ID = 'workbench.contrib.ollamaStatusBar';

	private entry: IStatusbarEntryAccessor | undefined;

	constructor(
		ollamaProvider: OllamaLanguageModelProvider,
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();

		this.updateEntry();

		// Re-render when settings change
		this._register(ollamaProvider.onDidChange(() => this.updateEntry()));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('ollamaAgent.baseUrl') || e.affectsConfiguration('ollamaAgent.model')) {
				this.updateEntry();
			}
		}));

		// Check connection status on startup
		this.checkAndUpdate(ollamaProvider);
	}

	private connected = false;

	private async checkAndUpdate(provider: OllamaLanguageModelProvider): Promise<void> {
		this.connected = await provider.checkConnection();
		this.updateEntry();
	}

	private updateEntry(): void {
		const statusText = '$(hubot) Dark Matter - Settings';
		const tooltip = this.connected
			? 'Dark Matter AI Settings (connected)'
			: 'Dark Matter AI Settings (not connected)';

		const props = {
			name: 'AI Server',
			text: statusText,
			ariaLabel: tooltip,
			tooltip,
			command: CONFIGURE_OLLAMA_CMD,
			showInAllWindows: true,
		};

		if (this.entry) {
			this.entry.update(props);
		} else {
			// Position: RIGHT side, just left of the notification bell
			// Notification bell uses Number.NEGATIVE_INFINITY (rightmost)
			// We use a very low number to be just left of it
			this.entry = this.statusbarService.addEntry(
				props,
				'ollama.statusBar',
				StatusbarAlignment.RIGHT,
				-Number.MAX_SAFE_INTEGER + 1 // just left of notification bell
			);
		}
	}

	override dispose(): void {
		super.dispose();
		this.entry?.dispose();
		this.entry = undefined;
	}
}
