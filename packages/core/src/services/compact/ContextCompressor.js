import { microCompact } from "./MicroCompact.js";
import { AutoCompactor, DEFAULT_AUTO_COMPACT_OPTIONS } from "./AutoCompact.js";
export const DEFAULT_COMPRESSION = {
    contextWindow: 100_000,
    triggerFraction: 0.85,
    microCompactCharLimit: 8_000,
};
/**
 * Façade for the three-layer compression strategy. Phase 2 ships:
 *   • MicroCompact (always-on, applied to tool results before they hit history)
 *   • AutoCompact  (model-summarized rollup near the context ceiling)
 * FullCompact (selective re-injection of critical files) is left for a later
 * phase once we have a "critical files" registry to draw from.
 */
export class ContextCompressor {
    auto;
    config;
    constructor(engine, config = {}) {
        this.config = { ...DEFAULT_COMPRESSION, ...config };
        this.auto = new AutoCompactor(engine, DEFAULT_AUTO_COMPACT_OPTIONS);
    }
    micro(content) {
        return microCompact(content, { maxChars: this.config.microCompactCharLimit });
    }
    shouldAutoCompact(estimatedTokens) {
        if (this.auto.isDisabled())
            return false;
        return estimatedTokens > this.config.contextWindow * this.config.triggerFraction;
    }
    async autoCompact(messages) {
        return this.auto.compact(messages);
    }
}
/**
 * Cheap token estimator: ~4 chars per token is the long-standing rule of
 * thumb for English + code. Good enough for compression triggers; we
 * never use this for billing.
 */
export function estimateTokens(messages) {
    let chars = 0;
    for (const m of messages) {
        if (typeof m.content === "string") {
            chars += m.content.length;
        }
        else {
            for (const b of m.content) {
                if (b.type === "text")
                    chars += b.text.length;
                else if (b.type === "tool_use")
                    chars += 80 + JSON.stringify(b.input).length;
                else if (b.type === "tool_result")
                    chars += b.content.length;
            }
        }
    }
    return Math.ceil(chars / 4);
}
//# sourceMappingURL=ContextCompressor.js.map