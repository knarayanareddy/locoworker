/**
 * Tracks prompt cache hit/miss patterns and estimates savings.
 */
export interface CacheEvent {
    ts: number;
    type: "hit" | "miss" | "write";
    layerHash: string;
    estimatedTokens: number;
    estimatedSavingsUsd?: number;
}
export declare class PromptCacheStats {
    private events;
    record(event: CacheEvent): void;
    summary(): {
        totalHits: number;
        totalMisses: number;
        hitRate: number;
        estimatedTokensSaved: number;
        estimatedUsdSaved: number;
        recentEvents: CacheEvent[];
    };
    reset(): void;
}
//# sourceMappingURL=PromptCacheStats.d.ts.map