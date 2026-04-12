/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dark Matter IDE Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ILifecycleService, LifecyclePhase, StartupKind } from '../../../../services/lifecycle/common/lifecycle.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';

const SETUP_COMPLETE_KEY = 'darkmatter.setupComplete';

export class DarkMatterWelcomeContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.darkMatterWelcome';

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@ILogService private readonly logService: ILogService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
	) {
		super();

		if (this.environmentService.skipWelcome) {
			return;
		}

		this.run();
	}

	private async run(): Promise<void> {
		await this.lifecycleService.when(LifecyclePhase.Restored);

		if (this.lifecycleService.startupKind === StartupKind.ReloadedWindow) {
			return;
		}

		const setupComplete = this.storageService.getBoolean(SETUP_COMPLETE_KEY, StorageScope.PROFILE, false);

		if (!setupComplete) {
			await this.runSetupWizard();
		}

	}

	// ========================================================================
	// Setup Wizard
	// ========================================================================

	private async runSetupWizard(): Promise<void> {
		this.logService.info('[Dark Matter] Running first-time setup wizard');

		const welcome = await this.quickInputService.pick(
			[
				{ id: 'continue', label: '$(rocket) Get Started', detail: 'Configure your AI server and default model' },
				{ id: 'skip', label: '$(debug-step-over) Skip Setup', detail: 'Use default settings (localhost:11434, llama3.1)' },
			],
			{ title: '🚀 Welcome to Dark Matter!', placeHolder: 'Dark Matter is an AI-powered IDE. Let\'s connect to your Ollama server.' }
		);

		if (!welcome || welcome.id === 'skip') { this.markSetupComplete(); return; }

		const currentUrl = this.configurationService.getValue<string>('ollamaAgent.baseUrl') || 'http://127.0.0.1:11434';
		const serverUrl = await this.quickInputService.input({
			title: '🔗 Step 1/2: Ollama Server URL', value: currentUrl,
			prompt: 'Enter the URL of your Ollama server.',
			validateInput: async (v) => { try { new URL(v); return undefined; } catch { return 'Invalid URL'; } },
		});

		if (serverUrl === undefined) { this.markSetupComplete(); return; }
		if (serverUrl !== currentUrl) { await this.configurationService.updateValue('ollamaAgent.baseUrl', serverUrl); }

		const baseUrl = serverUrl || currentUrl;
		let models: { name: string; size: number }[] = [];
		try {
			const r = await fetch(`${baseUrl}/api/tags`);
			if (r.ok) { models = (await r.json()).models || []; }
		} catch { /* skip */ }

		if (models.length === 0) {
			await this.quickInputService.pick(
				[{ id: 'ok', label: '$(warning) Could not connect', detail: `Configure later from "Dark Matter - Settings".` }],
				{ title: '⚠️ Connection Failed' }
			);
			this.markSetupComplete(); return;
		}

		const currentModel = this.configurationService.getValue<string>('ollamaAgent.model') || 'llama3.1';
		const modelItems: IQuickPickItem[] = models.map(m => ({
			id: m.name,
			label: m.name === currentModel ? `$(check) ${m.name}` : `     ${m.name}`,
			description: m.name === currentModel ? 'current default' : '',
			detail: `Size: ${(m.size / (1024 * 1024 * 1024)).toFixed(1)} GB`,
		}));

		const sel = await this.quickInputService.pick(modelItems, {
			title: `🤖 Step 2/2: Choose Default Model`, placeHolder: 'Select default model',
		});

		if (sel?.id && sel.id !== currentModel) { await this.configurationService.updateValue('ollamaAgent.model', sel.id); }
		this.markSetupComplete();
	}

	private markSetupComplete(): void {
		this.storageService.store(SETUP_COMPLETE_KEY, true, StorageScope.PROFILE, StorageTarget.USER);
	}

}
