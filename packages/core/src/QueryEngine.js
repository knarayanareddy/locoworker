const DEFAULT_RETRY = {
    maxRetries: 3,
    initialDelayMs: 1_000,
    backoffMultiplier: 2,
};
/**
 * Wraps a Provider with retry + classification of errors.
 * One module, one job: every model call goes through here so retry/cost
 * tracking lives in a single place (spec PART 3.2).
 */
export class QueryEngine {
    provider;
    retry;
    constructor(provider, retry = DEFAULT_RETRY) {
        this.provider = provider;
        this.retry = retry;
    }
    get model() {
        return this.provider.model;
    }
    get providerName() {
        return this.provider.name;
    }
    async call(options) {
        let attempt = 0;
        let lastError;
        while (attempt <= this.retry.maxRetries) {
            try {
                return await this.provider.call(options);
            }
            catch (e) {
                lastError = e;
                const classification = classifyError(e);
                if (classification === "context_overflow" || classification === "fatal") {
                    throw e;
                }
                if (attempt === this.retry.maxRetries)
                    break;
                const delay = this.retry.initialDelayMs * Math.pow(this.retry.backoffMultiplier, attempt);
                await sleep(delay);
                attempt++;
            }
        }
        throw lastError;
    }
}
function classifyError(e) {
    const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
    if (msg.includes("rate") || msg.includes("429"))
        return "rate_limit";
    if (msg.includes("context") && msg.includes("length"))
        return "context_overflow";
    if (msg.includes("context_length_exceeded"))
        return "context_overflow";
    if (msg.includes("econn") || msg.includes("etimedout") || msg.includes("network")) {
        return "transient";
    }
    if (msg.includes("503") || msg.includes("502") || msg.includes("504"))
        return "transient";
    if (msg.includes("401") || msg.includes("403") || msg.includes("invalid api key")) {
        return "fatal";
    }
    return "transient";
}
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
//# sourceMappingURL=QueryEngine.js.map