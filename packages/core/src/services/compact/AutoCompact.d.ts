import type { QueryEngine } from "../../QueryEngine.js";
import type { Message } from "../../types.js";
/**
 * Layer 2 compression: summarize the conversation through the model when
 * the context window is approaching its ceiling.
 *
 * Spec PART 8 calls out a circuit breaker: if compaction fails three times
 * in a row, stop trying — there are real production cases of >50 consecutive
 * failures wasting hundreds of thousands of API calls per day.
 */
export type AutoCompactOptions = {
    reservedBufferTokens: number;
    maxSummaryTokens: number;
    maxConsecutiveFailures: number;
};
export declare const DEFAULT_AUTO_COMPACT_OPTIONS: AutoCompactOptions;
export declare class AutoCompactor {
    private readonly engine;
    private readonly options;
    private consecutiveFailures;
    private disabled;
    constructor(engine: QueryEngine, options?: AutoCompactOptions);
    isDisabled(): boolean;
    /**
     * Returns a compacted message list, or null if compaction was skipped
     * (already disabled by circuit breaker, or fewer messages than fit).
     */
    compact(messages: Message[]): Promise<Message[] | null>;
    private recordFailure;
}
//# sourceMappingURL=AutoCompact.d.ts.map