/*---------------------------------------------------------------------------------------------
 *  Dark Matter - Editor Group Watermark
 *  Replaces the default VS Code watermark with Dark Matter branding.
 *--------------------------------------------------------------------------------------------*/

import { $, append, addDisposableListener } from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { URI } from '../../../../base/common/uri.js';
import { FileAccess } from '../../../../base/common/network.js';
import { ILogService } from '../../../../platform/log/common/log.js';

export class EditorGroupWatermark extends Disposable {

	constructor(
		container: HTMLElement,
		@ICommandService private readonly commandService: ICommandService,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this.render(container);
	}

	private async render(container: HTMLElement): Promise<void> {
		// Read logo
		let logoBase64 = '';
		try {
			const baseUri = FileAccess.asFileUri('');
			const logoUri = URI.joinPath(baseUri, '..', 'resources', 'darkmatter-1024.png');
			const logoData = await this.fileService.readFile(logoUri);
			const bytes = new Uint8Array(logoData.value.buffer);
			let binary = '';
			for (let i = 0; i < bytes.length; i++) {
				binary += String.fromCharCode(bytes[i]);
			}
			logoBase64 = btoa(binary);
		} catch (err) {
			this.logService.warn(`[Dark Matter] Watermark logo load error: ${err}`);
		}

		// Style tag
		const style = document.createElement('style');
		style.textContent = `
			.dm-watermark {
				position: absolute; top: 0; left: 0; right: 0; bottom: 0;
				display: flex; justify-content: center; align-items: center;
				background: #0d0d0d;
				font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
				color: #e0e0e0; overflow: hidden; z-index: 1;
			}
			.dm-watermark .dm-bg {
				position: absolute; top: -50%; left: -50%; width: 200%; height: 200%;
				background: radial-gradient(ellipse at 30% 20%, rgba(71,85,105,0.15) 0%, transparent 50%),
							radial-gradient(ellipse at 70% 80%, rgba(30,41,59,0.3) 0%, transparent 50%),
							radial-gradient(ellipse at 50% 50%, rgba(100,116,139,0.08) 0%, transparent 60%);
				animation: dmdrift 20s ease-in-out infinite alternate;
			}
			@keyframes dmdrift { 0% { transform: translate(0,0) rotate(0deg); } 100% { transform: translate(-3%,2%) rotate(3deg); } }
			@keyframes dmfloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
			.dm-watermark .dm-content { position: relative; z-index: 1; text-align: center; max-width: 480px; width: 100%; padding: 40px; }
			.dm-watermark .dm-logo { width: 100px; height: 100px; border-radius: 24px; margin-bottom: 28px;
				filter: drop-shadow(0 8px 32px rgba(148,163,184,0.3)); animation: dmfloat 3s ease-in-out infinite; }
			.dm-watermark .dm-logo-ph { font-size: 72px; margin-bottom: 28px; animation: dmfloat 3s ease-in-out infinite; }
			.dm-watermark h1 { font-size: 38px; font-weight: 700; margin: 0 0 6px; padding: 4px 0; letter-spacing: -1px; line-height: 1.2;
				background: linear-gradient(135deg, #f8fafc 0%, #cbd5e1 50%, #94a3b8 100%);
				-webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
			.dm-watermark .dm-tag { font-size: 13px; color: #6b7280; margin-bottom: 40px; letter-spacing: 2px; }
			.dm-watermark .dm-actions { display: flex; flex-direction: column; gap: 10px; }
			.dm-watermark .dm-btn { display: flex; align-items: center; gap: 14px; padding: 14px 20px;
				background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
				border-radius: 12px; color: #d1d5db; font-size: 14px; font-family: inherit;
				cursor: pointer; transition: all 0.2s ease; text-align: left; }
			.dm-watermark .dm-btn:hover { background: rgba(148,163,184,0.1); border-color: rgba(148,163,184,0.3);
				color: #f3f4f6; transform: translateX(4px); }
			.dm-watermark .dm-icon { width: 32px; height: 32px; border-radius: 8px; display: flex;
				align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
			.dm-watermark .i1 { background: rgba(59,130,246,0.15); }
			.dm-watermark .i2 { background: rgba(16,185,129,0.15); }
			.dm-watermark .i3 { background: rgba(245,158,11,0.15); }
			.dm-watermark .i4 { background: rgba(239,68,68,0.15); }
			.dm-watermark .dm-text .dm-title { font-weight: 600; font-size: 13px; }
			.dm-watermark .dm-text .dm-desc { font-size: 11px; color: #6b7280; margin-top: 1px; display: block; }
			.dm-watermark .dm-shortcut { margin-left: auto; font-size: 10px; color: #4b5563;
				font-family: 'SF Mono','Cascadia Code',monospace;
				background: rgba(255,255,255,0.05); padding: 3px 7px; border-radius: 5px;
				border: 1px solid rgba(255,255,255,0.08); }
			.dm-watermark .dm-footer { margin-top: 32px; font-size: 11px; color: #374151; }
		`;

		// Build DOM
		const watermark = $('div.editor-group-watermark.dm-watermark');
		watermark.appendChild(style);

		const bg = $('div.dm-bg');
		watermark.appendChild(bg);

		const content = $('div.dm-content');

		// Logo
		if (logoBase64) {
			const logo = document.createElement('img');
			logo.className = 'dm-logo';
			logo.src = `data:image/png;base64,${logoBase64}`;
			logo.alt = 'Dark Matter';
			content.appendChild(logo);
		} else {
			const ph = $('div.dm-logo-ph');
			ph.textContent = '🌌';
			content.appendChild(ph);
		}

		// Title
		const h1 = document.createElement('h1');
		h1.textContent = 'Dark Matter';
		content.appendChild(h1);

		// Tagline
		const tag = $('p.dm-tag');
		tag.textContent = 'AI-POWERED CODE EDITOR';
		content.appendChild(tag);

		// Buttons
		const actions = $('div.dm-actions');
		const buttons = [
			{ icon: '📄', cls: 'i1', title: 'New File', desc: 'Create an empty file', sc: 'Ctrl+N', cmd: 'workbench.action.files.newUntitledFile' },
			{ icon: '📂', cls: 'i2', title: 'Open File', desc: 'Open an existing file', sc: 'Ctrl+O', cmd: 'workbench.action.files.openFile' },
			{ icon: '📁', cls: 'i3', title: 'Open Folder', desc: 'Open a folder as workspace', sc: 'Ctrl+K O', cmd: 'workbench.action.files.openFolder' },
			{ icon: '⚡', cls: 'i4', title: 'Clone Repository', desc: 'Clone from Git', cmd: 'git.clone' },
		];

		for (const b of buttons) {
			const btn = $('button.dm-btn');
			const icon = $(`div.dm-icon.${b.cls}`);
			icon.textContent = b.icon;
			btn.appendChild(icon);

			const textWrap = $('div.dm-text');
			const title = $('span.dm-title');
			title.textContent = b.title;
			textWrap.appendChild(title);
			const desc = $('span.dm-desc');
			desc.textContent = b.desc;
			textWrap.appendChild(desc);
			btn.appendChild(textWrap);

			if (b.sc) {
				const sc = $('span.dm-shortcut');
				sc.textContent = b.sc;
				btn.appendChild(sc);
			}

			const command = b.cmd;
			this._register(addDisposableListener(btn, 'click', () => {
				this.commandService.executeCommand(command);
			}));

			actions.appendChild(btn);
		}

		content.appendChild(actions);

		// Footer
		const footer = $('p.dm-footer');
		footer.textContent = 'v1.0.0 · Local AI · Powered by Ollama';
		content.appendChild(footer);

		watermark.appendChild(content);

		// Clear existing watermark content and inject ours
		container.style.position = 'relative';
		append(container, watermark);
	}
}

