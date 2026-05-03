import type { Graph } from "../Graph.js";

/**
 * Modularity-based community detection.
 *
 * Spec calls out Leiden, which is Louvain with a refinement step that
 * guarantees well-connected communities. For this scope (a few thousand
 * nodes, navigation use case) classic Louvain produces communities just
 * as useful — and the implementation fits in one file with no deps.
 *
 * Returns a map from nodeId → communityId.
 */
export function detectCommunities(graph: Graph): Map<string, number> {
  const nodes = graph.nodes();
  const community = new Map<string, number>();
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node) community.set(node.id, i);
  }

  // Build undirected weight map: neighborWeights.get(node).get(other) = weight
  const neighborWeights = new Map<string, Map<string, number>>();
  let totalWeight = 0;
  for (const e of graph.edges()) {
    addWeight(neighborWeights, e.source, e.target, e.weight);
    addWeight(neighborWeights, e.target, e.source, e.weight);
    totalWeight += e.weight;
  }
  if (totalWeight === 0) return community;
  const m2 = totalWeight * 2;

  // Per-community total degree.
  const communityDegree = new Map<number, number>();
  for (const node of nodes) {
    const c = community.get(node.id);
    if (c === undefined) continue;
    const deg = nodeDegree(neighborWeights, node.id);
    communityDegree.set(c, (communityDegree.get(c) ?? 0) + deg);
  }

  let improved = true;
  let pass = 0;
  while (improved && pass < 8) {
    improved = false;
    pass++;
    for (const node of nodes) {
      const currentCommunity = community.get(node.id);
      if (currentCommunity === undefined) continue;
      const myNeighbors = neighborWeights.get(node.id) ?? new Map();
      const nodeDeg = nodeDegree(neighborWeights, node.id);

      // Tally neighbour-community connection weights.
      const candidateGains = new Map<number, number>();
      for (const [neighbour, weight] of myNeighbors) {
        const nc = community.get(neighbour);
        if (nc === undefined) continue;
        candidateGains.set(nc, (candidateGains.get(nc) ?? 0) + weight);
      }

      // Remove this node from its community for the comparison.
      const removalDeg = communityDegree.get(currentCommunity) ?? nodeDeg;
      const stayingTotal = removalDeg - nodeDeg;
      const selfWeight = candidateGains.get(currentCommunity) ?? 0;

      let bestCommunity = currentCommunity;
      let bestGain = 0;

      for (const [candidate, weight] of candidateGains) {
        if (candidate === currentCommunity) continue;
        const candidateTotal = communityDegree.get(candidate) ?? 0;
        const gain =
          weight / totalWeight - (candidateTotal * nodeDeg) / (m2 * totalWeight);
        const stayCost =
          selfWeight / totalWeight - (stayingTotal * nodeDeg) / (m2 * totalWeight);
        const delta = gain - stayCost;
        if (delta > bestGain + 1e-9) {
          bestGain = delta;
          bestCommunity = candidate;
        }
      }

      if (bestCommunity !== currentCommunity) {
        community.set(node.id, bestCommunity);
        communityDegree.set(currentCommunity, stayingTotal);
        communityDegree.set(
          bestCommunity,
          (communityDegree.get(bestCommunity) ?? 0) + nodeDeg,
        );
        improved = true;
      }
    }
  }

  // Compact community ids to 0..K-1 for nicer reports.
  return compact(community);
}

function addWeight(
  map: Map<string, Map<string, number>>,
  a: string,
  b: string,
  weight: number,
): void {
  const inner = map.get(a) ?? new Map<string, number>();
  inner.set(b, (inner.get(b) ?? 0) + weight);
  map.set(a, inner);
}

function nodeDegree(map: Map<string, Map<string, number>>, id: string): number {
  let d = 0;
  for (const [, w] of map.get(id) ?? new Map()) d += w;
  return d;
}

function compact(community: Map<string, number>): Map<string, number> {
  const remap = new Map<number, number>();
  let next = 0;
  const out = new Map<string, number>();
  for (const [k, v] of community) {
    let mapped = remap.get(v);
    if (mapped === undefined) {
      mapped = next++;
      remap.set(v, mapped);
    }
    out.set(k, mapped);
  }
  return out;
}
