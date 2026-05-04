import type { CallOptions, Provider, ProviderConfig } from "./ProviderInterface.js";
import type { ModelResponse } from "../types.js";
/**
 * Direct Anthropic Messages API — no translation needed since our
 * internal types are Anthropic-shaped.
 */
export declare class AnthropicProvider implements Provider {
    readonly name: "anthropic";
    readonly model: string;
    private client;
    constructor(config: ProviderConfig);
    call(options: CallOptions): Promise<ModelResponse>;
}
//# sourceMappingURL=AnthropicProvider.d.ts.map