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
import { createHash } from "node:crypto";
export class CacheAwareSystemPrompt {
    options;
    cachedClaudeMd = null;
    constructor(options) {
        this.options = options;
    }
    async build() {
        const layers = [];
        // ── Layer 1: Base (maximally stable — never changes) ──────────────────
        const baseContent = [
            this.options.baseSystemPrompt,
            this.options.toolDescriptions ?? "",
        ]
            .filter(Boolean)
            .join("\n\n");
        layers.push({
            content: baseContent,
            cacheBreakpoint: true, // mark for Anthropic cache_control
            hash: hash(baseContent),
        });
        // ── Layer 2: Project context (stable-ish — changes only if CLAUDE.md changes) ──
        const claudeMd = await this.loadClaudeMd();
        if (claudeMd) {
            layers.push({
                content: `<project_context>\n${claudeMd}\n</project_context>`,
                cacheBreakpoint: true,
                hash: hash(claudeMd),
            });
        }
        // ── Layer 3: Volatile (memory index — changes frequently, NO cache breakpoint) ──
        if (this.options.memoryIndexContent) {
            layers.push({
                content: `<memory_index>\n${this.options.memoryIndexContent}\n</memory_index>`,
                cacheBreakpoint: false,
                hash: hash(this.options.memoryIndexContent),
            });
        }
        const combined = layers.map((l) => l.content).join("\n\n");
        // Estimate cacheable tokens (layers 1 + 2 only)
        const cacheableContent = layers
            .filter((l) => l.cacheBreakpoint)
            .map((l) => l.content)
            .join("\n\n");
        return {
            layers,
            combined,
            estimatedCacheableTokens: Math.floor(cacheableContent.length / 4),
            baseLayerHash: layers[0].hash,
        };
    }
    /**
     * Converts layers into Anthropic-style content blocks with cache_control.
     * Use this when calling the Anthropic API directly.
     */
    toAnthropicBlocks(prompt) {
        return prompt.layers.map((layer) => ({
            type: "text",
            text: layer.content,
            ...(layer.cacheBreakpoint ? { cache_control: { type: "ephemeral" } } : {}),
        }));
    }
    async loadClaudeMd() {
        if (!this.options.claudeMdPath)
            return null;
        try {
            const file = Bun.file(this.options.claudeMdPath);
            const stat = await file.stat();
            const mtime = stat?.mtime?.getTime() ?? 0;
            // Use cached version if file hasn't changed
            if (this.cachedClaudeMd && this.cachedClaudeMd.mtime === mtime) {
                return this.cachedClaudeMd.content;
            }
            const content = (await file.text()).slice(0, 12_000);
            this.cachedClaudeMd = { content, mtime };
            return content;
        }
        catch {
            return null;
        }
    }
}
function hash(content) {
    return createHash("sha256").update(content).digest("hex").slice(0, 16);
}
//# sourceMappingURL=CacheAwareSystemPrompt.js.map