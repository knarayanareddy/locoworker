import { type MemoryDraft, type MemoryEntry, type MemoryFilter, type MemoryType } from "./MemoryTypes.js";
/**
 * File-backed CRUD for memory entries.
 *
 * Layout:
 *   <root>/
 *     MEMORY.md            ← index, owned by MemoryIndex (peer)
 *     user/<id>.md
 *     feedback/<id>.md
 *     project/<id>.md
 *     reference/<id>.md
 */
export declare class MemoryStore {
    private readonly root;
    constructor(root: string);
    init(): Promise<void>;
    save(draft: MemoryDraft): Promise<MemoryEntry>;
    tryLoad(type: MemoryType, id: string): Promise<MemoryEntry | null>;
    delete(type: MemoryType, id: string): Promise<boolean>;
    list(filter?: MemoryFilter): Promise<MemoryEntry[]>;
    pathFor(type: MemoryType, id: string): string;
    get rootPath(): string;
}
//# sourceMappingURL=MemoryStore.d.ts.map