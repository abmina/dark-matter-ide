/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dark Matter IDE Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { ChatAgentLocation } from '../../common/constants.js';
import {
	IChatMessage,
	IChatResponsePart,
	ILanguageModelChatMetadata,
	ILanguageModelChatMetadataAndIdentifier,
	ILanguageModelChatProvider,
	ILanguageModelChatRequestOptions,
	ILanguageModelChatResponse,
	ILanguageModelChatInfoOptions,
	ILanguageModelsService,
} from '../../common/languageModels.js';
import { OllamaLanguageModelProvider, OllamaModelInfo } from './ollamaLanguageModel.js';
import { OllamaChatAgent } from './ollamaChatAgent.js';
import { OllamaStatusBarEntry } from './ollamaStatusBar.js';

const OLLAMA_EXTENSION_ID = new ExtensionIdentifier('vscode.chat');
const OLLAMA_VENDOR = 'ollama';

// Register settings
Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'ollamaAgent',
	title: 'Ollama Agent',
	type: 'object',
	properties: {
		'ollamaAgent.baseUrl': {
			type: 'string',
			default: 'http://127.0.0.1:11434',
			description: 'The base URL for the local Ollama API server.',
		},
		'ollamaAgent.model': {
			type: 'string',
			default: 'llama3.1',
			description: 'The Ollama model to use for chat. Run "ollama list" to see available models.',
		},
		'ollamaAgent.gpuVramGb': {
			type: 'number',
			default: 8,
			description: 'Total GPU VRAM available (in GB). Used to auto-calculate the optimal context window.',
		},
		'ollamaAgent.autoContext': {
			type: 'boolean',
			default: true,
			description: 'Automatically calculate the optimal context window based on GPU VRAM and model size.',
		},
	},
});

/**
 * Registers Ollama models as language models in VS Code's model picker.
 */
class OllamaLanguageModelChatProvider implements ILanguageModelChatProvider {

	private readonly _onDidChange = new Emitter<void>();
	readonly onDidChange: Event<void> = this._onDidChange.event;

	constructor(
		private readonly ollamaProvider: OllamaLanguageModelProvider,
		private readonly logService: ILogService,
	) { }

	async provideLanguageModelChatInfo(_options: ILanguageModelChatInfoOptions, _token: CancellationToken): Promise<ILanguageModelChatMetadataAndIdentifier[]> {
		try {
			const models = await this.ollamaProvider.listModels();
			this.logService.info(`[Dark Matter] Discovered ${models.length} Ollama models for picker`);

			return models.map((model: OllamaModelInfo) => {
				const modelName = model.name;
				const identifier = `${OLLAMA_VENDOR}:${modelName}`;
				const metadata: ILanguageModelChatMetadata = {
					extension: OLLAMA_EXTENSION_ID,
					name: modelName,
					id: identifier,
					vendor: OLLAMA_VENDOR,
					version: '1.0',
					family: modelName.split(':')[0],
					maxInputTokens: 128000,
					maxOutputTokens: 8192,
					isUserSelectable: true,
					isDefaultForLocation: {
						[ChatAgentLocation.Chat]: modelName === this.ollamaProvider.model,
						[ChatAgentLocation.Terminal]: modelName === this.ollamaProvider.model,
						[ChatAgentLocation.Notebook]: modelName === this.ollamaProvider.model,
						[ChatAgentLocation.EditorInline]: modelName === this.ollamaProvider.model,
					},
					modelPickerCategory: { label: 'Ollama', order: 0 },
					capabilities: {
						vision: false,
						toolCalling: true,
						agentMode: true,
					},
				};
				return { metadata, identifier };
			});
		} catch (err) {
			this.logService.warn(`[Dark Matter] Failed to list Ollama models: ${err}`);
			return [];
		}
	}

	async sendChatRequest(
		_modelId: string,
		messages: IChatMessage[],
		_from: ExtensionIdentifier | undefined,
		_options: ILanguageModelChatRequestOptions,
		token: CancellationToken,
	): Promise<ILanguageModelChatResponse> {
		const ollamaMessages = messages.map(msg => ({
			role: msg.role === 0 ? 'system' as const :
				msg.role === 1 ? 'user' as const : 'assistant' as const,
			content: msg.content.map(part => 'value' in part ? part.value : '').join(''),
		}));

		const stream = this.ollamaProvider.sendChatRequest(ollamaMessages, token);

		const responseStream = (async function* () {
			for await (const chunk of stream) {
				yield { type: 'text' as const, value: chunk };
			}
		})();

		return {
			stream: responseStream as AsyncIterable<IChatResponsePart>,
			result: Promise.resolve({}),
		};
	}

	async provideTokenCount(_modelId: string, message: string | IChatMessage, _token: CancellationToken): Promise<number> {
		if (typeof message === 'string') {
			return Math.ceil(message.length / 4);
		}
		const text = message.content.map(p => 'value' in p ? p.value : '').join('');
		return Math.ceil(text.length / 4);
	}

	refresh(): void {
		this._onDidChange.fire();
	}

	dispose(): void {
		this._onDidChange.dispose();
	}
}

/**
 * Workbench contribution that bootstraps the Ollama integration.
 */
export class OllamaContribution extends Disposable {

	static readonly ID = 'workbench.contrib.ollamaAgent';

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.initialize();
	}

	private initialize(): void {
		const baseUrl = this.configurationService.getValue<string>('ollamaAgent.baseUrl') || 'http://127.0.0.1:11434';
		const model = this.configurationService.getValue<string>('ollamaAgent.model') || 'llama3.1';

		this.logService.info(`[Dark Matter] Initializing Ollama agent: server=${baseUrl}, model=${model}`);

		// Create the language model provider
		const ollamaProvider = this._register(this.instantiationService.createInstance(OllamaLanguageModelProvider));

		// Create and register the chat agent
		this._register(this.instantiationService.createInstance(OllamaChatAgent, ollamaProvider));

		// Create the status bar entry for quick AI settings access
		this._register(this.instantiationService.createInstance(OllamaStatusBarEntry, ollamaProvider));

		// Create the LM provider for the model picker
		const lmProvider = new OllamaLanguageModelChatProvider(ollamaProvider, this.logService);
		this._register(lmProvider);

		// === CRITICAL ORDER ===
		// Step 1: Register vendor FIRST (adds to _vendors map)
		this.languageModelsService.deltaLanguageModelChatProviderDescriptors(
			[{
				vendor: OLLAMA_VENDOR,
				displayName: 'Ollama',
				configuration: undefined,
				managementCommand: undefined,
				when: undefined
			}],
			[]
		);
		this.logService.info('[Dark Matter] Ollama vendor registered');

		// Step 2: Register the provider SECOND (adds to _providers map)
		this._register(this.languageModelsService.registerLanguageModelProvider(OLLAMA_VENDOR, lmProvider));
		this.logService.info('[Dark Matter] Ollama language model provider registered');

		// Step 3: Now trigger model resolution (both vendor + provider are in place)
		ollamaProvider.checkConnection().then(async connected => {
			if (connected) {
				this.logService.info(`[Dark Matter] Connected to Ollama at ${baseUrl}`);
				// Fire onDidChange to trigger _resolveAllLanguageModels
				lmProvider.refresh();
			} else {
				this.logService.warn(`[Dark Matter] Could not connect to Ollama at ${baseUrl}. Start Ollama or update the server URL in Settings.`);
			}
		});

		// Refresh models when settings change
		this._register(ollamaProvider.onDidChange(() => {
			lmProvider.refresh();
		}));
	}
}
