/**
 * MemoryGraph: builds a lightweight knowledge graph FROM the memory system.
 * Nodes = memory entries. Edges = co-occurrence, tag overlap, temporal proximity.
 * Provides path-based retrieval ("what chain of memories leads to X?").
 */

import { MemorySystem, type MemoryEntry } from "@cowork/core";

export interface MemNode {
  id: string;           // memory entry id
  name: string;
  type: string;
  tags: string[];
  confidence: number;
}

export interface MemEdge {
  source: string;
  target: string;
  weight: number;       // 0–1
  reason: "tag_overlap" | "temporal" | "entity_overlap" | "manual";
}

export interface MemGraphStats {
  nodeCount: number;
  edgeCount: number;
  avgDegree: number;
  isolatedNodes: number;
  clusters: number;
}

export class MemoryGraph {
  private nodes = new Map<string, MemNode>();
  private edges: MemEdge[] = [];
  private adjacency = new Map<string, Set<string>>();

  constructor() {}

  // ── Build from memory entries ──────────────────────────────────────────────

  static async build(projectRoot: string): Promise<MemoryGraph> {
    const memory = new MemorySystem(projectRoot);
    const entries = await memory.list();
    return MemoryGraph.fromEntries(entries);
  }

  static fromEntries(entries: MemoryEntry[]): MemoryGraph {
    const graph = new MemoryGraph();

    // Add nodes
    for (const entry of entries) {
      graph.nodes.set(entry.id, {
        id: entry.id,
        name: entry.name,
        type: entry.type,
        tags: entry.tags ?? [],
        confidence: entry.confidence ?? 0.5,
      });
      graph.adjacency.set(entry.id, new Set());
    }

    // Add edges by tag overlap
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i];
        const b = entries[j];

        const tagsA = new Set(a.tags ?? []);
        const tagsB = new Set(b.tags ?? []);
        const shared = [...tagsA].filter((t) => tagsB.has(t)).length;
        const union = new Set([...tagsA, ...tagsB]).size;

        if (shared > 0 && union > 0) {
          const weight = shared / union; // Jaccard similarity
          graph.addEdge({ source: a.id, target: b.id, weight, reason: "tag_overlap" });
        }
      }
    }

    return graph;
  }

  addEdge(edge: MemEdge): void {
    this.edges.push(edge);
    this.adjacency.get(edge.source)?.add(edge.target);
    this.adjacency.get(edge.target)?.add(edge.source);
  }

  // ── Retrieval ──────────────────────────────────────────────────────────────

  neighbors(nodeId: string, maxDepth = 1): MemNode[] {
    const visited = new Set<string>();
    const result: MemNode[] = [];

    const walk = (id: string, depth: number) => {
      if (depth > maxDepth || visited.has(id)) return;
      visited.add(id);
      if (id !== nodeId) {
        const node = this.nodes.get(id);
        if (node) result.push(node);
      }
      for (const neighbor of (this.adjacency.get(id) ?? [])) {
        walk(neighbor, depth + 1);
      }
    };

    walk(nodeId, 0);
    return result;
  }

  shortestPath(fromId: string, toId: string): MemNode[] {
    if (fromId === toId) return [this.nodes.get(fromId)!].filter(Boolean);
    const visited = new Set<string>();
    const queue: Array<{ id: string; path: string[] }> = [
      { id: fromId, path: [fromId] },
    ];

    while (queue.length > 0) {
      const { id, path } = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);

      for (const neighbor of (this.adjacency.get(id) ?? [])) {
        const newPath = [...path, neighbor];
        if (neighbor === toId) {
          return newPath.map((n) => this.nodes.get(n)!).filter(Boolean);
        }
        if (!visited.has(neighbor)) {
          queue.push({ id: neighbor, path: newPath });
        }
      }
    }
    return []; // no path found
  }

  central(limit = 10): MemNode[] {
    const degree = new Map<string, number>();
    for (const [id, neighbors] of this.adjacency.entries()) {
      degree.set(id, neighbors.size);
    }
    return [...this.nodes.values()]
      .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0))
      .slice(0, limit);
  }

  stats(): MemGraphStats {
    const degrees = [...this.adjacency.values()].map((s) => s.size);
    const isolated = degrees.filter((d) => d === 0).length;
    const avgDegree = degrees.length > 0
      ? degrees.reduce((a, b) => a + b, 0) / degrees.length
      : 0;
    return {
      nodeCount: this.nodes.size,
      edgeCount: this.edges.length,
      avgDegree,
      isolatedNodes: isolated,
      clusters: this.countClusters(),
    };
  }

  toNodes(): MemNode[] {
    return [...this.nodes.values()];
  }

  toEdges(): MemEdge[] {
    return this.edges;
  }

  private countClusters(): number {
    const visited = new Set<string>();
    let clusters = 0;
    for (const id of this.nodes.keys()) {
      if (!visited.has(id)) {
        clusters++;
        const stack = [id];
        while (stack.length) {
          const cur = stack.pop()!;
          if (visited.has(cur)) continue;
          visited.add(cur);
          for (const n of (this.adjacency.get(cur) ?? [])) {
            if (!visited.has(n)) stack.push(n);
          }
        }
      }
    }
    return clusters;
  }
}
