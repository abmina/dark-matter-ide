/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dark Matter IDE Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService, ILogger, ILoggerService } from '../../../../../platform/log/common/log.js';

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

	private readonly _modelContextLimits = new Map<string, number>();

	private readonly _logService: ILogger;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILoggerService private readonly loggerService: ILoggerService,
	) {
		super();

		this._logService = this._register(this.loggerService.createLogger('ollama', { name: 'Dark Matter' }));

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

	async listModels(): Promise<OllamaModelInfo[]> {
		try {
			const response = await fetch(`${this.baseUrl}/api/tags`);
			if (!response.ok) {
				this._logService.error(`[Ollama] Failed to list models: ${response.status} ${response.statusText}`);
				return [];
			}
			const data = await response.json();
			return data.models || [];
		} catch (error) {
			this._logService.error(`[Ollama] Failed to connect to ${this.baseUrl}: ${error}`);
			return [];
		}
	}

	async checkConnection(): Promise<boolean> {
		try {
			const response = await fetch(`${this.baseUrl}/api/tags`);
			return response.ok;
		} catch {
			return false;
		}
	}

	async getModelContextLimit(modelName: string): Promise<number | undefined> {
		if (this._modelContextLimits.has(modelName)) {
			return this._modelContextLimits.get(modelName);
		}

		try {
			const response = await fetch(`${this.baseUrl}/api/show`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: modelName })
			});

			if (response.ok) {
				const data = await response.json();
				const info = data.model_info || {};
				// Search for context length in model metadata (e.g., llama.context_length)
				for (const key of Object.keys(info)) {
					if (key.endsWith('.context_length')) {
						const limit = info[key];
						if (typeof limit === 'number') {
							this._modelContextLimits.set(modelName, limit);
							return limit;
						}
					}
				}
			}
		} catch (error) {
			this._logService.warn(`[Ollama] Failed to fetch model limits for ${modelName}: ${error}`);
		}

		return undefined;
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

		const url = `${this.baseUrl}/api/chat`;

		// Dark Matter target context is 256k, but we cap it to the model's native limit if known
		const targetCtx = 262144;
		const nativeLimit = await this.getModelContextLimit(activeModel);
		const finalCtx = nativeLimit ? Math.min(targetCtx, nativeLimit) : targetCtx;

		const body: OllamaChatRequest = {
			model: activeModel,
			messages,
			stream: true,
			options: {
				num_ctx: finalCtx
			}
		};

		this._logService.info(`[Ollama] Sending chat request to ${url} with model ${activeModel} (num_ctx: ${finalCtx}${nativeLimit ? " (capped)" : ""})`);

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
						this._logService.warn(`[Ollama] Failed to parse chunk: ${line}`);
					}
				}
			}
		} finally {
			reader.releaseLock();
		}
	}
}
