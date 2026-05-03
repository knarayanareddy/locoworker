import type { EdgeKind, GraphEdge, GraphNode, GraphSnapshot } from "./types.js";

/**
 * Plain in-memory graph with adjacency lookup.
 *
 * NetworkX it isn't, but it covers everything we need at personal-scale:
 * a few thousand nodes, fast neighbour lookup, deterministic snapshotting.
 */
export class Graph {
  private nodesById = new Map<string, GraphNode>();
  private outgoing = new Map<string, GraphEdge[]>();
  private incoming = new Map<string, GraphEdge[]>();

  upsertNode(node: GraphNode): GraphNode {
    const existing = this.nodesById.get(node.id);
    if (existing) {
      const merged = { ...existing, ...node };
      this.nodesById.set(node.id, merged);
      return merged;
    }
    this.nodesById.set(node.id, node);
    if (!this.outgoing.has(node.id)) this.outgoing.set(node.id, []);
    if (!this.incoming.has(node.id)) this.incoming.set(node.id, []);
    return node;
  }

  addEdge(edge: GraphEdge): void {
    if (!this.nodesById.has(edge.source)) return;
    if (!this.nodesById.has(edge.target)) return;
    if (edge.source === edge.target) return;

    const out = this.outgoing.get(edge.source);
    const inn = this.incoming.get(edge.target);
    if (!out || !inn) return;

    // Merge with an existing edge of the same kind so weights accumulate.
    const existing = out.find((e) => e.target === edge.target && e.kind === edge.kind);
    if (existing) {
      existing.weight += edge.weight;
      // Worse provenance dominates (EXTRACTED > INFERRED > AMBIGUOUS).
      if (rank(existing.provenance) < rank(edge.provenance)) {
        existing.provenance = edge.provenance;
      }
      return;
    }
    out.push(edge);
    inn.push(edge);
  }

  hasNode(id: string): boolean {
    return this.nodesById.has(id);
  }

  getNode(id: string): GraphNode | null {
    return this.nodesById.get(id) ?? null;
  }

  nodes(): GraphNode[] {
    return Array.from(this.nodesById.values());
  }

  edges(): GraphEdge[] {
    const out: GraphEdge[] = [];
    for (const list of this.outgoing.values()) out.push(...list);
    return out;
  }

  outEdges(id: string): GraphEdge[] {
    return this.outgoing.get(id) ?? [];
  }

  inEdges(id: string): GraphEdge[] {
    return this.incoming.get(id) ?? [];
  }

  neighbors(id: string, depth = 1): GraphNode[] {
    if (depth <= 0) return [];
    const seen = new Set<string>([id]);
    const frontier: { id: string; depth: number }[] = [{ id, depth }];
    const out: GraphNode[] = [];
    while (frontier.length > 0) {
      const item = frontier.shift();
      if (!item) break;
      const { id: current, depth: d } = item;
      if (d <= 0) continue;
      const neighborEdges = [
        ...(this.outgoing.get(current) ?? []),
        ...(this.incoming.get(current) ?? []),
      ];
      for (const e of neighborEdges) {
        const otherId = e.source === current ? e.target : e.source;
        if (seen.has(otherId)) continue;
        seen.add(otherId);
        const node = this.nodesById.get(otherId);
        if (!node) continue;
        out.push(node);
        if (d > 1) frontier.push({ id: otherId, depth: d - 1 });
      }
    }
    return out;
  }

  /**
   * BFS shortest path. Edges are treated as undirected here — for
   * navigation, "imports" and "imported-by" are equally useful.
   */
  shortestPath(from: string, to: string): string[] | null {
    if (from === to) return [from];
    if (!this.nodesById.has(from) || !this.nodesById.has(to)) return null;

    const queue: string[] = [from];
    const parent = new Map<string, string>();
    parent.set(from, "");

    while (queue.length > 0) {
      const current = queue.shift()!;
      const adjacent = [
        ...(this.outgoing.get(current) ?? []).map((e) => e.target),
        ...(this.incoming.get(current) ?? []).map((e) => e.source),
      ];
      for (const next of adjacent) {
        if (parent.has(next)) continue;
        parent.set(next, current);
        if (next === to) {
          const path: string[] = [next];
          let cursor = current;
          while (cursor) {
            path.unshift(cursor);
            const p = parent.get(cursor);
            if (!p || p === cursor) break;
            cursor = p;
          }
          return path;
        }
        queue.push(next);
      }
    }
    return null;
  }

  toSnapshot(metadata: GraphSnapshot["metadata"]): GraphSnapshot {
    return {
      metadata,
      nodes: this.nodes(),
      edges: this.edges(),
    };
  }

  static fromSnapshot(snapshot: GraphSnapshot): Graph {
    const g = new Graph();
    for (const n of snapshot.nodes) g.upsertNode(n);
    for (const e of snapshot.edges) g.addEdge(e);
    return g;
  }

  countByKind(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const n of this.nodesById.values()) {
      out[n.kind] = (out[n.kind] ?? 0) + 1;
    }
    return out;
  }

  countEdgesByKind(): Record<EdgeKind, number> {
    const out: Record<string, number> = {};
    for (const e of this.edges()) {
      out[e.kind] = (out[e.kind] ?? 0) + 1;
    }
    return out as Record<EdgeKind, number>;
  }
}

function rank(p: string): number {
  return p === "EXTRACTED" ? 3 : p === "INFERRED" ? 2 : 1;
}
