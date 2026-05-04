import type { MemoryEntry } from "./MemoryTypes.js";
export type SearchResult = {
    entry: MemoryEntry;
    score: number;
    /** Which retrievers found this (one or both). */
    via: ("bm25" | "vector")[];
};
export type HybridSearchOptions = {
    embedderUrl?: string;
    embedderModel?: string;
    embedderApiKey?: string;
    /** RRF rank-fusion constant. Higher = flatter weighting. */
    rrfK?: number;
};
/**
 * Hybrid retrieval: BM25 + cosine-similarity over embeddings, merged via
 * Reciprocal Rank Fusion. Vector search is optional — if no embedder URL
 * is configured (or the call fails), we degrade gracefully to BM25-only.
 */
export declare class HybridSearch {
    private embedder;
    private rrfK;
    constructor(opts?: HybridSearchOptions);
    hasEmbedder(): boolean;
    search(query: string, corpus: MemoryEntry[], limit?: number): Promise<SearchResult[]>;
    private vectorSearch;
}
//# sourceMappingURL=HybridSearch.d.ts.map