import { BM25 } from "./BM25.js";
import { Embedder, cosineSimilarity } from "./Embedder.js";
const DEFAULT_RRF_K = 60;
/**
 * Hybrid retrieval: BM25 + cosine-similarity over embeddings, merged via
 * Reciprocal Rank Fusion. Vector search is optional — if no embedder URL
 * is configured (or the call fails), we degrade gracefully to BM25-only.
 */
export class HybridSearch {
    embedder;
    rrfK;
    constructor(opts = {}) {
        if (opts.embedderUrl && opts.embedderModel) {
            this.embedder = new Embedder({
                baseUrl: opts.embedderUrl,
                model: opts.embedderModel,
                apiKey: opts.embedderApiKey,
            });
        }
        else {
            this.embedder = null;
        }
        this.rrfK = opts.rrfK ?? DEFAULT_RRF_K;
    }
    hasEmbedder() {
        return this.embedder !== null;
    }
    async search(query, corpus, limit = 5) {
        if (corpus.length === 0)
            return [];
        const bm25 = new BM25(corpus.map((entry) => ({
            doc: entry,
            text: `${entry.name}\n${entry.description}\n${entry.tags.join(" ")}\n${entry.body}`,
        })));
        const bm25Results = bm25.search(query, limit * 4);
        let vectorResults = [];
        if (this.embedder) {
            vectorResults = await this.vectorSearch(query, corpus, limit * 4);
        }
        return rrfMerge(bm25Results, vectorResults, this.rrfK, limit);
    }
    async vectorSearch(query, corpus, limit) {
        if (!this.embedder)
            return [];
        const queryVec = await this.embedder.embed(query);
        if (!queryVec)
            return [];
        const corpusTexts = corpus.map((e) => `${e.name}\n${e.description}\n${e.body}`);
        const vecs = await this.embedder.embedBatch(corpusTexts);
        const scored = [];
        for (let i = 0; i < corpus.length; i++) {
            const v = vecs[i];
            const entry = corpus[i];
            if (!v || !entry)
                continue;
            const sim = cosineSimilarity(queryVec, v);
            if (sim > 0)
                scored.push({ entry, score: sim });
        }
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, limit);
    }
}
function rrfMerge(bm25, vector, k, limit) {
    const buckets = new Map();
    bm25.forEach((r, idx) => {
        const key = r.doc.id;
        const existing = buckets.get(key);
        const contribution = 1 / (k + idx + 1);
        if (existing) {
            existing.score += contribution;
            if (!existing.via.includes("bm25"))
                existing.via.push("bm25");
        }
        else {
            buckets.set(key, { entry: r.doc, score: contribution, via: ["bm25"] });
        }
    });
    vector.forEach((r, idx) => {
        const key = r.entry.id;
        const existing = buckets.get(key);
        const contribution = 1 / (k + idx + 1);
        if (existing) {
            existing.score += contribution;
            if (!existing.via.includes("vector"))
                existing.via.push("vector");
        }
        else {
            buckets.set(key, { entry: r.entry, score: contribution, via: ["vector"] });
        }
    });
    const merged = Array.from(buckets.values()).sort((a, b) => b.score - a.score);
    return merged.slice(0, limit);
}
//# sourceMappingURL=HybridSearch.js.map