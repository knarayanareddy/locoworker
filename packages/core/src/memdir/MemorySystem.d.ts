import { MemoryStore } from "./MemoryStore.js";
import { MemoryIndex } from "./MemoryIndex.js";
import { TranscriptLog } from "./Transcript.js";
import { HybridSearch, type SearchResult } from "./HybridSearch.js";
import { type MemoryDraft, type MemoryEntry, type MemoryFilter, type MemoryType } from "./MemoryTypes.js";
export type MemorySystemOptions = {
    projectRoot: string;
    homeRoot?: string;
    embedderUrl?: string;
    embedderModel?: string;
};
/**
 * Facade that wires MemoryStore + MemoryIndex + TranscriptLog + HybridSearch
 * together and exposes a small surface to the rest of the system.
 */
export declare class MemorySystem {
    readonly store: MemoryStore;
    readonly index: MemoryIndex;
    readonly transcripts: TranscriptLog;
    readonly search: HybridSearch;
    static rootFor(projectRoot: string, homeRoot?: string): string;
    constructor(opts: MemorySystemOptions);
    save(draft: MemoryDraft): Promise<MemoryEntry>;
    delete(type: MemoryType, id: string): Promise<boolean>;
    list(filter?: MemoryFilter): Promise<MemoryEntry[]>;
    query(text: string, limit?: number, filter?: MemoryFilter): Promise<SearchResult[]>;
    readIndex(): Promise<string>;
    rebuildIndex(): Promise<void>;
    appendTranscript(sessionId: string, role: string, content: string): Promise<void>;
}
//# sourceMappingURL=MemorySystem.d.ts.map