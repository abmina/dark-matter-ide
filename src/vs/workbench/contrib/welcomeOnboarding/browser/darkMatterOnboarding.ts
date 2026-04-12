/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dark Matter IDE Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IOnboardingService } from '../common/onboardingService.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { $, append, addDisposableListener, EventType, getActiveWindow, clearNode } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { FileAccess } from '../../../../base/common/network.js';
import { ILogService } from '../../../../platform/log/common/log.js';

export class DarkMatterOnboarding extends Disposable implements IOnboardingService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidDismiss = this._register(new Emitter<void>());
	readonly onDidDismiss: Event<void> = this._onDidDismiss.event;

	private readonly _onDidComplete = this._register(new Emitter<void>());

	private overlay: HTMLElement | undefined;
	private card: HTMLElement | undefined;
	private readonly disposables = this._register(new DisposableStore());

	private currentStep = 0;
	private serverUrl = '';
	private logoUrl = '';
	private selectedModel = '';
	private models: { name: string; size: number }[] = [];

	private _isShowing = false;
	get isShowing(): boolean { return this._isShowing; }

	constructor(
		@ILayoutService private readonly layoutService: ILayoutService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INotificationService private readonly notificationService: INotificationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.serverUrl = this.configurationService.getValue<string>('ollamaAgent.baseUrl') || 'http://127.0.0.1:11434';
		this.selectedModel = this.configurationService.getValue<string>('ollamaAgent.model') || 'llama3.1';
		try {
			this.logoUrl = FileAccess.asBrowserUri('vs/workbench/browser/media/darkmatter-icon.png').toString(true);
		} catch (err) {
			this.logService.warn(`[Dark Matter Onboarding] Logo URL error: ${err}`);
		}
	}

	show(): void {
		if (this.overlay) { return; }
		this._isShowing = true;

		const container = this.layoutService.activeContainer;

		// Inject styles — colors matched to welcome screen (#0d0d0d, slate palette)
		const style = document.createElement('style');
		style.textContent = `
			.dm-onboard-overlay {
				position: absolute; inset: 0; z-index: 10000;
				display: flex; align-items: center; justify-content: center;
				background: rgba(0,0,0,0.75); backdrop-filter: blur(12px);
				opacity: 0; transition: opacity 0.3s ease;
				font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			}
			.dm-onboard-overlay.visible { opacity: 1; }
			.dm-onboard-card {
				background: #0d0d0d; border: 1px solid rgba(148,163,184,0.1);
				border-radius: 20px; width: 500px; max-width: 90vw;
				box-shadow: 0 25px 80px rgba(0,0,0,0.6);
				overflow: hidden; transform: translateY(20px) scale(0.95);
				transition: transform 0.3s ease;
			}
			.dm-onboard-overlay.visible .dm-onboard-card { transform: translateY(0) scale(1); }
			.dm-onboard-header {
				padding: 40px 40px 0; text-align: center;
			}
			@keyframes dm-ob-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
			.dm-onboard-logo {
				width: 80px; height: 80px; border-radius: 20px; margin: 0 auto 20px;
				background: rgba(255,255,255,0.03); border: 1px solid rgba(148,163,184,0.15);
				display: flex; align-items: center; justify-content: center;
				font-size: 28px; font-weight: 800; color: #cbd5e1; letter-spacing: 3px;
				animation: dm-ob-float 3s ease-in-out infinite;
				box-shadow: 0 8px 32px rgba(148,163,184,0.15);
				overflow: hidden;
			}
			.dm-onboard-logo img {
				width: 100%; height: 100%; object-fit: cover; border-radius: 20px;
			}
			.dm-onboard-title {
				font-size: 28px; font-weight: 700; margin: 0 0 8px; letter-spacing: -0.5px;
				background: linear-gradient(135deg, #f8fafc 0%, #cbd5e1 50%, #94a3b8 100%);
				-webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
			}
			.dm-onboard-subtitle {
				font-size: 14px; color: #6b7280; margin: 0 0 4px; line-height: 1.5;
			}
			.dm-onboard-body { padding: 24px 40px; }
			.dm-onboard-label {
				font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase;
				letter-spacing: 1px; margin-bottom: 8px;
			}
			.dm-onboard-input {
				width: 100%; padding: 12px 16px; border-radius: 10px;
				background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
				color: #e0e0e0; font-size: 14px; font-family: inherit;
				outline: none; transition: border-color 0.2s;
				box-sizing: border-box;
			}
			.dm-onboard-input:focus { border-color: rgba(148,163,184,0.4); }
			.dm-onboard-model-list {
				max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px;
				margin-top: 8px;
			}
			.dm-onboard-model-item {
				padding: 10px 14px; border-radius: 8px; cursor: pointer;
				background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
				color: #d1d5db; font-size: 13px; display: flex; align-items: center;
				justify-content: space-between; transition: all 0.15s;
			}
			.dm-onboard-model-item:hover { background: rgba(148,163,184,0.1); border-color: rgba(148,163,184,0.25); }
			.dm-onboard-model-item.selected { background: rgba(148,163,184,0.12); border-color: rgba(148,163,184,0.35); color: #f1f5f9; }
			.dm-onboard-model-size { font-size: 11px; color: #4b5563; }
			.dm-onboard-status { padding: 8px 0; font-size: 13px; color: #6b7280; text-align: center; }
			.dm-onboard-status.error { color: #f87171; }
			.dm-onboard-status.success { color: #34d399; }
			.dm-onboard-footer {
				padding: 20px 40px 32px; display: flex; justify-content: space-between; align-items: center;
			}
			.dm-onboard-btn {
				padding: 10px 24px; border-radius: 10px; font-size: 14px; font-weight: 600;
				cursor: pointer; transition: all 0.2s; font-family: inherit; border: none;
			}
			.dm-onboard-btn-primary {
				background: rgba(148,163,184,0.15); color: #f3f4f6;
				border: 1px solid rgba(148,163,184,0.25);
			}
			.dm-onboard-btn-primary:hover { background: rgba(148,163,184,0.25); transform: translateY(-1px); }
			.dm-onboard-btn-primary:disabled { opacity: 0.4; cursor: default; transform: none; }
			.dm-onboard-btn-ghost {
				background: transparent; color: #4b5563; border: 1px solid rgba(255,255,255,0.06);
			}
			.dm-onboard-btn-ghost:hover { color: #d1d5db; border-color: rgba(255,255,255,0.12); }
			.dm-onboard-privacy {
				padding: 0 40px 24px; font-size: 11px; color: #374151; text-align: center; line-height: 1.5;
			}
		`;

		// Build DOM
		this.overlay = append(container, $('div.dm-onboard-overlay'));
		this.overlay.appendChild(style);
		this.overlay.setAttribute('role', 'dialog');
		this.overlay.setAttribute('aria-modal', 'true');
		this.overlay.setAttribute('aria-label', 'Dark Matter Setup');

		this.card = append(this.overlay, $('div.dm-onboard-card'));

		this._renderStep();

		// Event handlers
		this.disposables.add(addDisposableListener(this.overlay, EventType.MOUSE_DOWN, (e: MouseEvent) => {
			if (e.target === this.overlay) { this._dismiss(); }
		}));
		this.disposables.add(addDisposableListener(this.overlay, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			if (event.keyCode === KeyCode.Escape) {
				e.preventDefault();
				e.stopPropagation();
				this._dismiss();
			}
		}));

		// Entrance animation
		getActiveWindow().requestAnimationFrame(() => {
			this.overlay?.classList.add('visible');
		});
	}

	private _dismiss(): void {
		if (!this.overlay) { return; }
		this.overlay.classList.remove('visible');
		setTimeout(() => {
			this.overlay?.remove();
			this.overlay = undefined;
			this.card = undefined;
			this._isShowing = false;
			this._onDidDismiss.fire();
		}, 300);
	}

	private _renderStep(): void {
		if (!this.card) { return; }
		clearNode(this.card);

		switch (this.currentStep) {
			case 0: this._renderWelcomeStep(); break;
			case 1: this._renderServerStep(); break;
			case 2: this._renderModelStep(); break;
			case 3: this._renderDoneStep(); break;
		}
	}

	// =====================================================================
	// Step 0: Welcome
	// =====================================================================
	private _renderWelcomeStep(): void {
		const header = append(this.card!, $('div.dm-onboard-header'));
		const logo = append(header, $('div.dm-onboard-logo'));
		this._renderLogo(logo);
		const title = append(header, $('h2.dm-onboard-title'));
		title.textContent = 'Welcome to Dark Matter';
		const subtitle = append(header, $('p.dm-onboard-subtitle'));
		subtitle.textContent = 'Your AI-powered code editor.\nLet\'s connect to your local Ollama server to enable AI features.';

		const body = append(this.card!, $('div.dm-onboard-body'));
		const features = [
			{ icon: '🤖', text: 'Built-in AI chat powered by Ollama' },
			{ icon: '🔒', text: '100% local — your code never leaves your machine' },
			{ icon: '⚡', text: 'Any model: Gemma, Llama, Mistral, DeepSeek...' },
		];
		for (const f of features) {
			const row = append(body, $('div'));
			row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:8px 0;color:#d1d5db;font-size:14px;';
			const icon = append(row, $('span'));
			icon.textContent = f.icon;
			icon.style.fontSize = '18px';
			const text = append(row, $('span'));
			text.textContent = f.text;
		}

		const footer = append(this.card!, $('div.dm-onboard-footer'));
		const skipBtn = append(footer, $<HTMLButtonElement>('button.dm-onboard-btn.dm-onboard-btn-ghost'));
		skipBtn.textContent = 'Skip';
		skipBtn.type = 'button';
		this.disposables.add(addDisposableListener(skipBtn, EventType.CLICK, () => this._dismiss()));

		const nextBtn = append(footer, $<HTMLButtonElement>('button.dm-onboard-btn.dm-onboard-btn-primary'));
		nextBtn.textContent = 'Get Started';
		nextBtn.type = 'button';
		this.disposables.add(addDisposableListener(nextBtn, EventType.CLICK, () => {
			this.currentStep = 1;
			this._renderStep();
		}));

		const privacy = append(this.card!, $('div.dm-onboard-privacy'));
		privacy.textContent = 'Dark Matter does not collect or send any telemetry data. All AI processing happens locally on your machine.';
	}

	// =====================================================================
	// Step 1: Server URL
	// =====================================================================
	private _renderServerStep(): void {
		const header = append(this.card!, $('div.dm-onboard-header'));
		const title = append(header, $('h2.dm-onboard-title'));
		title.textContent = 'Connect to Ollama';
		const subtitle = append(header, $('p.dm-onboard-subtitle'));
		subtitle.textContent = 'Enter the URL of your Ollama server. If running locally, the default works out of the box.';

		const body = append(this.card!, $('div.dm-onboard-body'));
		const label = append(body, $('div.dm-onboard-label'));
		label.textContent = 'Server URL';
		const input = append(body, $<HTMLInputElement>('input.dm-onboard-input'));
		input.type = 'text';
		input.value = this.serverUrl;
		input.placeholder = 'http://127.0.0.1:11434';

		const status = append(body, $('div.dm-onboard-status'));

		const footer = append(this.card!, $('div.dm-onboard-footer'));
		const backBtn = append(footer, $<HTMLButtonElement>('button.dm-onboard-btn.dm-onboard-btn-ghost'));
		backBtn.textContent = 'Back';
		backBtn.type = 'button';
		this.disposables.add(addDisposableListener(backBtn, EventType.CLICK, () => {
			this.currentStep = 0;
			this._renderStep();
		}));

		const testBtn = append(footer, $<HTMLButtonElement>('button.dm-onboard-btn.dm-onboard-btn-primary'));
		testBtn.textContent = 'Test Connection';
		testBtn.type = 'button';

		this.disposables.add(addDisposableListener(testBtn, EventType.CLICK, async () => {
			const url = input.value.trim();
			if (!url) { return; }

			try {
				new URL(url);
			} catch {
				status.textContent = '✗ Invalid URL format';
				status.className = 'dm-onboard-status error';
				return;
			}

			status.textContent = 'Testing connection...';
			status.className = 'dm-onboard-status';
			testBtn.disabled = true;

			try {
				const r = await fetch(`${url}/api/tags`);
				if (r.ok) {
					const data = await r.json();
					this.models = data.models || [];
					this.serverUrl = url;
					status.textContent = `✓ Connected! Found ${this.models.length} model(s)`;
					status.className = 'dm-onboard-status success';

					await this.configurationService.updateValue('ollamaAgent.baseUrl', url);

					// Auto-advance after brief delay
					setTimeout(() => {
						this.currentStep = 2;
						this._renderStep();
					}, 800);
				} else {
					status.textContent = '✗ Server responded with an error';
					status.className = 'dm-onboard-status error';
				}
			} catch {
				status.textContent = '✗ Could not connect. Is Ollama running?';
				status.className = 'dm-onboard-status error';
			}
			testBtn.disabled = false;
		}));
	}

	// =====================================================================
	// Step 2: Model Selection
	// =====================================================================
	private _renderModelStep(): void {
		const header = append(this.card!, $('div.dm-onboard-header'));
		const title = append(header, $('h2.dm-onboard-title'));
		title.textContent = 'Choose Your Model';
		const subtitle = append(header, $('p.dm-onboard-subtitle'));
		subtitle.textContent = `Found ${this.models.length} model(s) on your server. Select a default for the AI chat.`;

		const body = append(this.card!, $('div.dm-onboard-body'));
		const list = append(body, $('div.dm-onboard-model-list'));

		const items: HTMLElement[] = [];
		for (const m of this.models) {
			const item = append(list, $('div.dm-onboard-model-item'));
			const name = append(item, $('span'));
			name.textContent = m.name;
			const size = append(item, $('span.dm-onboard-model-size'));
			size.textContent = `${(m.size / (1024 * 1024 * 1024)).toFixed(1)} GB`;

			if (m.name === this.selectedModel) {
				item.classList.add('selected');
			}

			items.push(item);
			this.disposables.add(addDisposableListener(item, EventType.CLICK, () => {
				this.selectedModel = m.name;
				for (const it of items) { it.classList.remove('selected'); }
				item.classList.add('selected');
			}));
		}

		if (this.models.length === 0) {
			const empty = append(body, $('div.dm-onboard-status'));
			empty.textContent = 'No models found. Run: ollama pull gemma3:4b';
			empty.className = 'dm-onboard-status';
		}

		const footer = append(this.card!, $('div.dm-onboard-footer'));
		const backBtn = append(footer, $<HTMLButtonElement>('button.dm-onboard-btn.dm-onboard-btn-ghost'));
		backBtn.textContent = 'Back';
		backBtn.type = 'button';
		this.disposables.add(addDisposableListener(backBtn, EventType.CLICK, () => {
			this.currentStep = 1;
			this._renderStep();
		}));

		const nextBtn = append(footer, $<HTMLButtonElement>('button.dm-onboard-btn.dm-onboard-btn-primary'));
		nextBtn.textContent = 'Continue';
		nextBtn.type = 'button';
		this.disposables.add(addDisposableListener(nextBtn, EventType.CLICK, async () => {
			if (this.selectedModel) {
				await this.configurationService.updateValue('ollamaAgent.model', this.selectedModel);
			}
			this.currentStep = 3;
			this._renderStep();
		}));
	}

	// =====================================================================
	// Step 3: Done
	// =====================================================================
	private _renderDoneStep(): void {
		const header = append(this.card!, $('div.dm-onboard-header'));
		const logo = append(header, $('div.dm-onboard-logo'));
		this._renderLogo(logo);
		const title = append(header, $('h2.dm-onboard-title'));
		title.textContent = 'You\'re All Set!';
		const subtitle = append(header, $('p.dm-onboard-subtitle'));
		subtitle.textContent = `Connected to ${this.serverUrl}\nUsing model: ${this.selectedModel || 'default'}`;

		const body = append(this.card!, $('div.dm-onboard-body'));
		const tip = append(body, $('div'));
		tip.style.cssText = 'text-align:center;color:#94a3b8;font-size:13px;line-height:1.6;';
		tip.innerHTML = 'Open the <strong style="color:#d1d5db">Chat panel</strong> from the sidebar to start talking to your AI.<br>Click <strong style="color:#d1d5db">Dark Matter - Settings</strong> in the status bar to change settings anytime.';

		const footer = append(this.card!, $('div.dm-onboard-footer'));
		footer.style.justifyContent = 'center';
		const doneBtn = append(footer, $<HTMLButtonElement>('button.dm-onboard-btn.dm-onboard-btn-primary'));
		doneBtn.textContent = 'Start Coding';
		doneBtn.type = 'button';
		doneBtn.style.padding = '12px 48px';
		this.disposables.add(addDisposableListener(doneBtn, EventType.CLICK, () => this._dismiss()));
	}

	private _renderLogo(container: HTMLElement): void {
		if (this.logoUrl) {
			const img = document.createElement('img');
			img.src = this.logoUrl;
			img.alt = 'Dark Matter';
			container.appendChild(img);
		} else {
			container.textContent = 'DM';
		}
	}
}
