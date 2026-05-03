import type { Message, ModelResponse } from "../types.js";
import type { ToolDefinition } from "../Tool.js";

export type ProviderName =
  | "anthropic"
  | "openai"
  | "ollama"
  | "lmstudio"
  | "deepseek"
  | "openrouter";

export type ProviderConfig = {
  name: ProviderName;
  apiKey?: string;
  baseUrl?: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
};

export type CallOptions = {
  systemPrompt: string;
  messages: Message[];
  tools: ToolDefinition[];
  maxTokens?: number;
  abortSignal?: AbortSignal;
};

export interface Provider {
  readonly name: ProviderName;
  readonly model: string;
  call(options: CallOptions): Promise<ModelResponse>;
}
