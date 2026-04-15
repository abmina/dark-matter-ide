/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dark Matter IDE Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../platform/log/common/log.js';

export interface OllamaChatMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export interface OllamaChatRequest {
	model: string;
	messages: OllamaChatMessage[];
	stream: boolean;
	options?: {
		num_ctx?: number;
	};
}

export interface OllamaChatResponseChunk {
	model: string;
	message: { role: string; content: string };
	done: boolean;
}

export interface OllamaModelInfo {
	name: string;
	size: number;
	digest: string;
	modified_at: string;
}

export class OllamaLanguageModelProvider extends Disposable {

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('ollamaAgent.baseUrl') || e.affectsConfiguration('ollamaAgent.model')) {
				this._onDidChange.fire();
			}
		}));
	}

	get baseUrl(): string {
		return this.configurationService.getValue<string>('ollamaAgent.baseUrl') || 'http://127.0.0.1:11434';
	}

	get model(): string {
		return this.configurationService.getValue<string>('ollamaAgent.model') || 'llama3.1';
	}

	get gpuVramGb(): number {
		return this.configurationService.getValue<number>('ollamaAgent.gpuVramGb') || 8;
	}

	get autoContext(): boolean {
		return this.configurationService.getValue<boolean>('ollamaAgent.autoContext') ?? true;
	}

	async getOptimalContext(modelName: string): Promise<number> {
		if (!this.autoContext) {
			return 8192; // safe default
		}

		try {
			const models = await this.listModels();
			const model = models.find(m => m.name === modelName || m.name.split(':')[0] === modelName);

			if (!model) {
				return 8192;
			}

			const totalVramBytes = this.gpuVramGb * 1024 * 1024 * 1024;
			const modelSizeBytes = model.size;
			const remainingVramBytes = totalVramBytes - modelSizeBytes;

			if (remainingVramBytes <= 0) {
				return 2048; // minimum fallback
			}

			// Conservative estimate: ~512KB per token for KV cache (FP16, 32-40 layers)
			// This varies by model, but 512KB is a safe "average high" for 7B-30B models.
			const bytesPerToken = 512 * 1024;
			const calculatedContext = Math.floor(remainingVramBytes / bytesPerToken);

			// Clamp between 2k and 256k
			return Math.min(Math.max(calculatedContext, 2048), 262144);

		} catch {
			return 8192;
		}
	}

	async *sendChatRequest(
		messages: OllamaChatMessage[],
		token: CancellationToken,
		modelOverride?: string
	): AsyncIterable<string> {
		// Use the override model if provided, stripping the vendor prefix if present
		let activeModel = modelOverride || this.model;
		if (activeModel.startsWith('ollama:')) {
			activeModel = activeModel.substring('ollama:'.length);
		}

		const optimalCtx = await this.getOptimalContext(activeModel);
		this.logService.info(`[Ollama] Calculated optimal context for ${activeModel} with ${this.gpuVramGb}GB VRAM: ${optimalCtx} tokens`);

		const url = `${this.baseUrl}/api/chat`;
		const body: OllamaChatRequest = {
			model: activeModel,
			messages,
			stream: true,
			options: {
				num_ctx: optimalCtx
			}
		};

		this.logService.info(`[Ollama] Sending chat request to ${url} with model ${activeModel}`);

		const abortController = new AbortController();
		token.onCancellationRequested(() => abortController.abort());

		let response: Response;
		try {
			response = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
				signal: abortController.signal,
			});
		} catch (error) {
			throw new Error(`Failed to connect to Ollama at ${this.baseUrl}. Is the Ollama server running? Error: ${error}`);
		}

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Ollama request failed (${response.status}): ${errorText}`);
		}

		const reader = response.body?.getReader();
		if (!reader) {
			throw new Error('No response body from Ollama');
		}

		const decoder = new TextDecoder();
		let buffer = '';

		try {
			while (true) {
				if (token.isCancellationRequested) {
					break;
				}

				const { done, value } = await reader.read();
				if (done) {
					break;
				}

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (!line.trim()) {
						continue;
					}

					try {
						const chunk: OllamaChatResponseChunk = JSON.parse(line);
						if (chunk.message?.content) {
							yield chunk.message.content;
						}
						if (chunk.done) {
							return;
						}
					} catch {
						this.logService.warn(`[Ollama] Failed to parse chunk: ${line}`);
					}
				}
			}
		} finally {
			reader.releaseLock();
		}
	}
}
