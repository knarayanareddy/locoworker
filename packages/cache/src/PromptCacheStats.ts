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

export class PromptCacheStats {
  private events: CacheEvent[] = [];

  record(event: CacheEvent): void {
    this.events.push(event);
  }

  summary(): {
    totalHits: number;
    totalMisses: number;
    hitRate: number;
    estimatedTokensSaved: number;
    estimatedUsdSaved: number;
    recentEvents: CacheEvent[];
  } {
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

  reset(): void {
    this.events = [];
  }
}
