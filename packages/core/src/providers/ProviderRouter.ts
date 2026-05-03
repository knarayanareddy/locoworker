import type { Provider, ProviderConfig, ProviderName } from "./ProviderInterface.js";
import { AnthropicProvider } from "./AnthropicProvider.js";
import { OpenAIShim } from "./OpenAIShim.js";

export type ProviderResolutionInput = {
  provider?: ProviderName;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  env: NodeJS.ProcessEnv;
};

const DEFAULT_BASE_URLS: Record<ProviderName, string | undefined> = {
  anthropic: undefined,
  openai: "https://api.openai.com/v1",
  ollama: "http://localhost:11434/v1",
  lmstudio: "http://localhost:1234/v1",
  deepseek: "https://api.deepseek.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
};

const DEFAULT_MODELS: Record<ProviderName, string> = {
  anthropic: "claude-sonnet-4-5",
  openai: "gpt-4o-mini",
  ollama: "qwen2.5-coder:7b",
  lmstudio: "local-model",
  deepseek: "deepseek-chat",
  openrouter: "openai/gpt-4o-mini",
};

const ENV_KEYS: Record<ProviderName, string | null> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  ollama: null,
  lmstudio: null,
  deepseek: "DEEPSEEK_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

const ENV_BASE_URL_KEYS: Partial<Record<ProviderName, string>> = {
  ollama: "OLLAMA_BASE_URL",
  lmstudio: "LMSTUDIO_BASE_URL",
};

export function resolveProvider(input: ProviderResolutionInput): Provider {
  const env = input.env;
  const name: ProviderName =
    input.provider ?? (env.COWORK_PROVIDER as ProviderName | undefined) ?? "ollama";

  if (!isProviderName(name)) {
    throw new Error(
      `Unknown provider "${name}". Expected one of: anthropic, openai, ollama, lmstudio, deepseek, openrouter`,
    );
  }

  const apiKeyEnv = ENV_KEYS[name];
  const apiKey = input.apiKey ?? (apiKeyEnv ? env[apiKeyEnv] : undefined);
  const baseUrlEnvKey = ENV_BASE_URL_KEYS[name];
  const baseUrl =
    input.baseUrl ??
    (baseUrlEnvKey ? env[baseUrlEnvKey] : undefined) ??
    DEFAULT_BASE_URLS[name];
  const model = input.model ?? env.COWORK_MODEL ?? DEFAULT_MODELS[name];

  const config: ProviderConfig = { name, apiKey, baseUrl, model };

  if (name === "anthropic") return new AnthropicProvider(config);
  return new OpenAIShim(config);
}

function isProviderName(s: string): s is ProviderName {
  return ["anthropic", "openai", "ollama", "lmstudio", "deepseek", "openrouter"].includes(s);
}
