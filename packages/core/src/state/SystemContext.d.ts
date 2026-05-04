import type { MemorySystem } from "../memdir/MemorySystem.js";
/**
 * Assemble the full system prompt by stacking:
 *   1. Base agent identity prompt (always-present)
 *   2. Project CLAUDE.md (if present)
 *   3. MEMORY.md index (if any memories exist)
 *
 * Order matters for prompt caching (spec PART 20): the base prompt is
 * cache-stable, the project section is cache-stable per project, and
 * MEMORY.md sits at the boundary because it changes whenever a memory
 * is added.
 */
export declare function assembleSystemPrompt(basePrompt: string, projectRoot: string, memory: MemorySystem | null): Promise<string>;
//# sourceMappingURL=SystemContext.d.ts.map