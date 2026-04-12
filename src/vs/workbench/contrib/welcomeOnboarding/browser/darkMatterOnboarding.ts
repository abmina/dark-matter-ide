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
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';

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
	private selectedModel = '';
	private models: { name: string; size: number }[] = [];

	private _isShowing = false;
	get isShowing(): boolean { return this._isShowing; }

	constructor(
		@ILayoutService private readonly layoutService: ILayoutService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		this.serverUrl = this.configurationService.getValue<string>('ollamaAgent.baseUrl') || 'http://127.0.0.1:11434';
		this.selectedModel = this.configurationService.getValue<string>('ollamaAgent.model') || 'llama3.1';
	}

	show(): void {
		if (this.overlay) { return; }
		this._isShowing = true;

		const container = this.layoutService.activeContainer;

		// Inject styles
		const style = document.createElement('style');
		style.textContent = `
			.dm-onboard-overlay {
				position: absolute; inset: 0; z-index: 10000;
				display: flex; align-items: center; justify-content: center;
				background: rgba(0,0,0,0.7); backdrop-filter: blur(8px);
				opacity: 0; transition: opacity 0.3s ease;
				font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			}
			.dm-onboard-overlay.visible { opacity: 1; }
			.dm-onboard-card {
				background: #1a1a2e; border: 1px solid rgba(148,163,184,0.15);
				border-radius: 20px; width: 500px; max-width: 90vw;
				box-shadow: 0 25px 80px rgba(0,0,0,0.5);
				overflow: hidden; transform: translateY(20px) scale(0.95);
				transition: transform 0.3s ease;
			}
			.dm-onboard-overlay.visible .dm-onboard-card { transform: translateY(0) scale(1); }
			.dm-onboard-header {
				padding: 40px 40px 0; text-align: center;
			}
			.dm-onboard-logo {
				width: 64px; height: 64px; border-radius: 16px; margin: 0 auto 20px;
				background: rgba(148,163,184,0.08); border: 1px solid rgba(148,163,184,0.15);
				display: flex; align-items: center; justify-content: center;
				font-size: 24px; font-weight: 800; color: #cbd5e1; letter-spacing: 2px;
			}
			.dm-onboard-title {
				font-size: 24px; font-weight: 700; color: #f1f5f9; margin: 0 0 8px;
			}
			.dm-onboard-subtitle {
				font-size: 14px; color: #94a3b8; margin: 0 0 4px; line-height: 1.5;
			}
			.dm-onboard-body { padding: 24px 40px; }
			.dm-onboard-label {
				font-size: 12px; font-weight: 600; color: #94a3b8; text-transform: uppercase;
				letter-spacing: 1px; margin-bottom: 8px;
			}
			.dm-onboard-input {
				width: 100%; padding: 12px 16px; border-radius: 10px;
				background: rgba(255,255,255,0.05); border: 1px solid rgba(148,163,184,0.2);
				color: #f1f5f9; font-size: 14px; font-family: inherit;
				outline: none; transition: border-color 0.2s;
				box-sizing: border-box;
			}
			.dm-onboard-input:focus { border-color: rgba(99,102,241,0.6); }
			.dm-onboard-model-list {
				max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px;
				margin-top: 8px;
			}
			.dm-onboard-model-item {
				padding: 10px 14px; border-radius: 8px; cursor: pointer;
				background: rgba(255,255,255,0.03); border: 1px solid rgba(148,163,184,0.1);
				color: #d1d5db; font-size: 13px; display: flex; align-items: center;
				justify-content: space-between; transition: all 0.15s;
			}
			.dm-onboard-model-item:hover { background: rgba(99,102,241,0.1); border-color: rgba(99,102,241,0.3); }
			.dm-onboard-model-item.selected { background: rgba(99,102,241,0.15); border-color: rgba(99,102,241,0.4); color: #f1f5f9; }
			.dm-onboard-model-size { font-size: 11px; color: #6b7280; }
			.dm-onboard-status { padding: 8px 0; font-size: 13px; color: #94a3b8; text-align: center; }
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
				background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white;
			}
			.dm-onboard-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 4px 15px rgba(99,102,241,0.4); }
			.dm-onboard-btn-primary:disabled { opacity: 0.5; cursor: default; transform: none; box-shadow: none; }
			.dm-onboard-btn-ghost {
				background: transparent; color: #6b7280; border: 1px solid rgba(148,163,184,0.15);
			}
			.dm-onboard-btn-ghost:hover { color: #d1d5db; border-color: rgba(148,163,184,0.3); }
			.dm-onboard-privacy {
				padding: 0 40px 20px; font-size: 11px; color: #4b5563; text-align: center; line-height: 1.5;
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
		logo.textContent = 'DM';
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
		logo.textContent = '✓';
		logo.style.color = '#34d399';
		logo.style.fontSize = '32px';
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
}
