import type { Provider, CallOptions } from "./providers/ProviderInterface.js";
import type { ModelResponse } from "./types.js";
export type RetryConfig = {
    maxRetries: number;
    initialDelayMs: number;
    backoffMultiplier: number;
};
/**
 * Wraps a Provider with retry + classification of errors.
 * One module, one job: every model call goes through here so retry/cost
 * tracking lives in a single place (spec PART 3.2).
 */
export declare class QueryEngine {
    private readonly provider;
    private readonly retry;
    constructor(provider: Provider, retry?: RetryConfig);
    get model(): string;
    get providerName(): string;
    call(options: CallOptions): Promise<ModelResponse>;
}
//# sourceMappingURL=QueryEngine.d.ts.map