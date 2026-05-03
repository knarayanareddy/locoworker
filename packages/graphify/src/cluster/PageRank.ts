import type { Graph } from "../Graph.js";

/**
 * Standard PageRank with constant teleport probability. Used to surface
 * "god nodes" — files everything else depends on — in GRAPH_REPORT.
 */
export function pageRank(
  graph: Graph,
  options: { dampening?: number; iterations?: number; tolerance?: number } = {},
): Map<string, number> {
  const dampening = options.dampening ?? 0.85;
  const iterations = options.iterations ?? 30;
  const tolerance = options.tolerance ?? 1e-5;

  const nodes = graph.nodes();
  const n = nodes.length;
  if (n === 0) return new Map();

  const ranks = new Map<string, number>();
  for (const node of nodes) ranks.set(node.id, 1 / n);

  // Treat edges as undirected for "centrality of this node in the
  // codebase" — a file imported by many is just as central as one
  // that imports many.
  const adj = new Map<string, string[]>();
  for (const node of nodes) adj.set(node.id, []);
  for (const e of graph.edges()) {
    adj.get(e.source)?.push(e.target);
    adj.get(e.target)?.push(e.source);
  }

  for (let iter = 0; iter < iterations; iter++) {
    const next = new Map<string, number>();
    for (const node of nodes) next.set(node.id, (1 - dampening) / n);

    for (const node of nodes) {
      const neighbours = adj.get(node.id) ?? [];
      if (neighbours.length === 0) {
        // Distribute dangling rank evenly.
        const share = (dampening * (ranks.get(node.id) ?? 0)) / n;
        for (const m of nodes) {
          next.set(m.id, (next.get(m.id) ?? 0) + share);
        }
        continue;
      }
      const share = (dampening * (ranks.get(node.id) ?? 0)) / neighbours.length;
      for (const target of neighbours) {
        next.set(target, (next.get(target) ?? 0) + share);
      }
    }

    let delta = 0;
    for (const [id, value] of next) {
      delta += Math.abs(value - (ranks.get(id) ?? 0));
      ranks.set(id, value);
    }
    if (delta < tolerance) break;
  }

  return ranks;
}
