import type { QueryEngine } from "../QueryEngine.js";
import type { MemorySystem } from "./MemorySystem.js";
/**
 * AutoDream — memory consolidation pass.
 *
 * Spec: PART 6 Layer 4. The dream-system metaphor: between sessions a
 * sub-call wakes up, looks at all stored memories, merges duplicates,
 * resolves contradictions, datestamps anything still relative, and
 * rebuilds MEMORY.md.
 *
 * Phase 2 ships a deterministic mechanical pass for the easy operations
 * (duplicate merge by name/body, relative-date conversion, low-confidence
 * pruning). The model-driven semantic pass — finding contradictions across
 * entries that don't share words — is invoked only when a QueryEngine is
 * supplied via consolidateWithModel(); otherwise the mechanical pass alone
 * keeps memory healthy at small scale.
 */
export type DreamReport = {
    scanned: number;
    duplicatesMerged: number;
    staleRemoved: number;
    datestampsFixed: number;
    contradictionsResolved: number;
    finalCount: number;
};
export declare class AutoDream {
    private readonly memory;
    constructor(memory: MemorySystem);
    /** Mechanical consolidation pass — no model call. Always safe to run. */
    consolidate(): Promise<DreamReport>;
    /**
     * Optional second pass: ask a model to find semantic duplicates and
     * contradictions that the deterministic pass can't see. This is the
     * "REM sleep" half of AutoDream from the spec; it costs API calls so
     * gate it behind an explicit invocation.
     */
    consolidateWithModel(engine: QueryEngine): Promise<DreamReport>;
}
//# sourceMappingURL=AutoDream.d.ts.map