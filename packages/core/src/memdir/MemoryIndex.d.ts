import type { MemoryEntry } from "./MemoryTypes.js";
/**
 * MEMORY.md is the always-loaded entry point — one line per memory pointer,
 * grouped by type, hard-capped at 200 lines so the index never blows up the
 * context window.
 */
export declare class MemoryIndex {
    private readonly root;
    static readonly MAX_LINES = 200;
    constructor(root: string);
    get path(): string;
    read(): Promise<string>;
    rebuild(entries: MemoryEntry[]): Promise<void>;
}
//# sourceMappingURL=MemoryIndex.d.ts.map