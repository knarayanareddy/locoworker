import type { CallOptions, Provider, ProviderConfig, ProviderName } from "./ProviderInterface.js";
import type { ModelResponse } from "../types.js";
/**
 * OpenAI-compatible shim. Translates the Anthropic-shaped internal types
 * to/from the OpenAI Chat Completions schema. Works against:
 *   - api.openai.com
 *   - localhost:11434/v1   (Ollama)
 *   - localhost:1234/v1    (LM Studio)
 *   - api.deepseek.com/v1
 *   - openrouter.ai/api/v1
 */
export declare class OpenAIShim implements Provider {
    readonly name: ProviderName;
    readonly model: string;
    private client;
    constructor(config: ProviderConfig);
    call(options: CallOptions): Promise<ModelResponse>;
}
//# sourceMappingURL=OpenAIShim.d.ts.map