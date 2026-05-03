import { Graph } from "../Graph.js";
import type { GraphNode } from "../types.js";

export type SearchHit = {
  node: GraphNode;
  score: number;
};

export type NeighborQuery = {
  nodeId: string;
  depth?: number;
};

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
  "has", "in", "is", "it", "of", "on", "that", "the", "to", "with",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * High-level query surface for the graph. Powers both the agent-facing
 * GraphifyQuery tool and any later HTTP / MCP front-ends.
 *
 * Uses a self-contained BM25 ranker rather than reaching back into core
 * — graphify must stay leaf-package so core can wire its tools in without
 * a circular import.
 */
export class GraphQuery {
  private indexedDocs: { node: GraphNode; tokens: string[]; tf: Map<string, number> }[] = [];
  private df = new Map<string, number>();
  private avgDocLen = 0;
  private indexed = false;

  constructor(private readonly graph: Graph) {}

  ensureIndex(): void {
    if (this.indexed) return;
    const docs: { node: GraphNode; tokens: string[]; tf: Map<string, number> }[] = [];
    let total = 0;
    for (const node of this.graph.nodes()) {
      const text = [node.name, node.kind, node.path ?? "", node.summary ?? ""].join(" ");
      const tokens = tokenize(text);
      const tf = new Map<string, number>();
      for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
      const seen = new Set(tokens);
      for (const t of seen) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      docs.push({ node, tokens, tf });
      total += tokens.length;
    }
    this.indexedDocs = docs;
    this.avgDocLen = docs.length > 0 ? total / docs.length : 0;
    this.indexed = true;
  }

  search(query: string, limit = 10): SearchHit[] {
    this.ensureIndex();
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0 || this.indexedDocs.length === 0) return [];

    const N = this.indexedDocs.length;
    const k1 = 1.5;
    const b = 0.75;
    const hits: SearchHit[] = [];

    for (const { node, tokens, tf } of this.indexedDocs) {
      let score = 0;
      const docLen = tokens.length;
      for (const term of queryTokens) {
        const f = tf.get(term);
        if (!f) continue;
        const dfT = this.df.get(term) ?? 0;
        const idf = Math.log(1 + (N - dfT + 0.5) / (dfT + 0.5));
        const norm = 1 - b + b * (this.avgDocLen > 0 ? docLen / this.avgDocLen : 1);
        score += idf * ((f * (k1 + 1)) / (f + k1 * norm));
      }
      if (score > 0) hits.push({ node, score });
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, limit);
  }

  getNode(id: string): GraphNode | null {
    return this.graph.getNode(id);
  }

  getNeighbors(query: NeighborQuery): GraphNode[] {
    return this.graph.neighbors(query.nodeId, query.depth ?? 1);
  }

  shortestPath(from: string, to: string): GraphNode[] | null {
    const path = this.graph.shortestPath(from, to);
    if (!path) return null;
    return path
      .map((id) => this.graph.getNode(id))
      .filter((n): n is GraphNode => n !== null);
  }

  byCommunity(community: number): GraphNode[] {
    return this.graph.nodes().filter((n) => n.community === community);
  }

  topByCentrality(limit = 20): GraphNode[] {
    return this.graph
      .nodes()
      .filter((n) => n.centrality !== undefined)
      .sort((a, b) => (b.centrality ?? 0) - (a.centrality ?? 0))
      .slice(0, limit);
  }
}
