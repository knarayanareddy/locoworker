import type { Message } from "../../types.js";
import type { QueryEngine } from "../../QueryEngine.js";
import { AutoCompactor } from "./AutoCompact.js";
export type CompressionConfig = {
    /** Soft target context window for the active model, in tokens. */
    contextWindow: number;
    /** Fraction of the window at which AutoCompact fires. */
    triggerFraction: number;
    /** Max chars per individual tool result before MicroCompact trims it. */
    microCompactCharLimit: number;
};
export declare const DEFAULT_COMPRESSION: CompressionConfig;
/**
 * Façade for the three-layer compression strategy. Phase 2 ships:
 *   • MicroCompact (always-on, applied to tool results before they hit history)
 *   • AutoCompact  (model-summarized rollup near the context ceiling)
 * FullCompact (selective re-injection of critical files) is left for a later
 * phase once we have a "critical files" registry to draw from.
 */
export declare class ContextCompressor {
    readonly auto: AutoCompactor;
    readonly config: CompressionConfig;
    constructor(engine: QueryEngine, config?: Partial<CompressionConfig>);
    micro(content: string): string;
    shouldAutoCompact(estimatedTokens: number): boolean;
    autoCompact(messages: Message[]): Promise<Message[] | null>;
}
/**
 * Cheap token estimator: ~4 chars per token is the long-standing rule of
 * thumb for English + code. Good enough for compression triggers; we
 * never use this for billing.
 */
export declare function estimateTokens(messages: Message[]): number;
//# sourceMappingURL=ContextCompressor.d.ts.map