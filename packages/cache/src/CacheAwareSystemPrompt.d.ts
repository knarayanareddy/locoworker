/**
 * Cache-aware system prompt builder.
 *
 * Anthropic's prompt caching requires the prompt to be IDENTICAL
 * across requests to hit the cache. This module enforces:
 *
 * 1. Stable base layer (never changes mid-session)
 * 2. Stable project layer (CLAUDE.md — changes only if file changes)
 * 3. Volatile layer (MEMORY.md index — changes every few turns)
 *
 * The first two layers will hit the cache on Anthropic (>1024 tokens).
 * The volatile layer is always fresh.
 *
 * Also produces cache breakpoint markers for the Anthropic API's
 * explicit cache_control blocks.
 */
export interface CachedPromptLayer {
    content: string;
    cacheBreakpoint: boolean;
    hash: string;
}
export interface CacheAwarePrompt {
    layers: CachedPromptLayer[];
    combined: string;
    estimatedCacheableTokens: number;
    baseLayerHash: string;
}
export interface CachePromptOptions {
    baseSystemPrompt: string;
    claudeMdPath?: string;
    memoryIndexContent?: string;
    toolDescriptions?: string;
}
export declare class CacheAwareSystemPrompt {
    private options;
    private cachedClaudeMd;
    constructor(options: CachePromptOptions);
    build(): Promise<CacheAwarePrompt>;
    /**
     * Converts layers into Anthropic-style content blocks with cache_control.
     * Use this when calling the Anthropic API directly.
     */
    toAnthropicBlocks(prompt: CacheAwarePrompt): Array<{
        type: "text";
        text: string;
        cache_control?: {
            type: "ephemeral";
        };
    }>;
    private loadClaudeMd;
}
//# sourceMappingURL=CacheAwareSystemPrompt.d.ts.map