/**
 * Memory architecture — spec PART 6.
 *
 * Four typed memory categories. Each entry lives as a single Markdown file
 * under ~/.cowork/projects/<project>/memory/<type>/<id>.md and is summarized
 * in MEMORY.md (the always-loaded index, hard-capped at 200 lines).
 */
export type MemoryType = "user" | "feedback" | "project" | "reference";
export declare const MEMORY_TYPES: readonly MemoryType[];
export type MemoryEntry = {
    id: string;
    type: MemoryType;
    name: string;
    description: string;
    body: string;
    tags: string[];
    createdAt: string;
    updatedAt: string;
    sessionId: string | null;
    /** Confidence the entry is still accurate. AutoDream may decay or boost this. */
    confidence: number;
};
export type MemoryDraft = Omit<MemoryEntry, "id" | "createdAt" | "updatedAt"> & {
    id?: string;
};
export type MemoryFilter = {
    type?: MemoryType;
    tags?: string[];
    query?: string;
    limit?: number;
};
export declare const DESCRIPTIONS: Record<MemoryType, string>;
export declare function isMemoryType(s: string): s is MemoryType;
//# sourceMappingURL=MemoryTypes.d.ts.map