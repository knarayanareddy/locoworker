/**
 * Minimal BM25 ranker — pure JS, no deps.
 *
 * Built per-query against a small corpus (the user's memory entries),
 * which is fine because we re-tokenize every search. If memory grows past
 * thousands of entries we'd persist the index, but for personal scale
 * a few hundred entries is the realistic ceiling.
 */

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
  "has", "he", "in", "is", "it", "its", "of", "on", "that", "the",
  "to", "was", "were", "will", "with", "i", "you", "we", "they",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

export type BM25Doc<T> = {
  doc: T;
  text: string;
};

export type BM25Result<T> = {
  doc: T;
  score: number;
};

const K1 = 1.5;
const B = 0.75;

export class BM25<T> {
  private docs: { doc: T; tokens: string[]; tf: Map<string, number> }[] = [];
  private df = new Map<string, number>();
  private avgDocLen = 0;

  constructor(corpus: BM25Doc<T>[]) {
    let total = 0;
    for (const { doc, text } of corpus) {
      const tokens = tokenize(text);
      const tf = new Map<string, number>();
      for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
      this.docs.push({ doc, tokens, tf });
      total += tokens.length;
      const seen = new Set(tokens);
      for (const t of seen) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    }
    this.avgDocLen = this.docs.length > 0 ? total / this.docs.length : 0;
  }

  search(query: string, limit = 10): BM25Result<T>[] {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0 || this.docs.length === 0) return [];

    const N = this.docs.length;
    const results: BM25Result<T>[] = [];

    for (const { doc, tokens, tf } of this.docs) {
      let score = 0;
      const docLen = tokens.length;
      for (const term of queryTokens) {
        const f = tf.get(term);
        if (!f) continue;
        const dfT = this.df.get(term) ?? 0;
        const idf = Math.log(1 + (N - dfT + 0.5) / (dfT + 0.5));
        const norm = 1 - B + B * (this.avgDocLen > 0 ? docLen / this.avgDocLen : 1);
        score += idf * ((f * (K1 + 1)) / (f + K1 * norm));
      }
      if (score > 0) results.push({ doc, score });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }
}
