/**
 * Tracks prompt cache hit/miss patterns and estimates savings.
 */
export class PromptCacheStats {
    events = [];
    record(event) {
        this.events.push(event);
    }
    summary() {
        const hits = this.events.filter((e) => e.type === "hit");
        const misses = this.events.filter((e) => e.type === "miss");
        const total = hits.length + misses.length;
        return {
            totalHits: hits.length,
            totalMisses: misses.length,
            hitRate: total > 0 ? hits.length / total : 0,
            estimatedTokensSaved: hits.reduce((s, e) => s + e.estimatedTokens, 0),
            estimatedUsdSaved: hits.reduce((s, e) => s + (e.estimatedSavingsUsd ?? 0), 0),
            recentEvents: this.events.slice(-20),
        };
    }
    reset() {
        this.events = [];
    }
}
//# sourceMappingURL=PromptCacheStats.js.map