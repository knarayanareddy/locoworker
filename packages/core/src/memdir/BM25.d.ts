/**
 * Minimal BM25 ranker — pure JS, no deps.
 *
 * Built per-query against a small corpus (the user's memory entries),
 * which is fine because we re-tokenize every search. If memory grows past
 * thousands of entries we'd persist the index, but for personal scale
 * a few hundred entries is the realistic ceiling.
 */
export declare function tokenize(text: string): string[];
export type BM25Doc<T> = {
    doc: T;
    text: string;
};
export type BM25Result<T> = {
    doc: T;
    score: number;
};
export declare class BM25<T> {
    private docs;
    private df;
    private avgDocLen;
    constructor(corpus: BM25Doc<T>[]);
    search(query: string, limit?: number): BM25Result<T>[];
}
//# sourceMappingURL=BM25.d.ts.map