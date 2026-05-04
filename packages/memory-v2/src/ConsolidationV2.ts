/**
 * ConsolidationV2: enhanced memory consolidation that uses the MemoryGraph
 * to detect clusters of related memories and merge them into summary entries.
 *
 * Extends Phase 2's AutoDream with graph-aware cluster merging.
 */

import { MemorySystem, type MemoryEntry } from "@cowork/core";
import { MemoryGraph } from "./MemoryGraph";
import { QueryEngine, resolveProvider } from "@cowork/core";

export interface ConsolidationConfig {
  projectRoot: string;
  provider: string;
  model: string;
  minClusterSize?: number;         // default 3
  maxSummaryChars?: number;        // default 500
  confidenceThreshold?: number;    // drop entries below this (default 0.3)
  dryRun?: boolean;
}

export interface ConsolidationReport {
  clustersFound: number;
  entriesMerged: number;
  entriesPruned: number;
  summariesCreated: number;
  durationMs: number;
}

export class ConsolidationV2 {
  private config: ConsolidationConfig;
  private engine: QueryEngine;

  constructor(config: ConsolidationConfig) {
    this.config = {
      minClusterSize: 3,
      maxSummaryChars: 500,
      confidenceThreshold: 0.3,
      dryRun: false,
      ...config,
    };
    const provider = resolveProvider({
      provider: config.provider,
      model: config.model,
    });
    this.engine = new QueryEngine(provider);
  }

  async run(): Promise<ConsolidationReport> {
    const startMs = Date.now();
    const memory = new MemorySystem(this.config.projectRoot);
    const entries = await memory.list();

    let entriesPruned = 0;
    let entriesMerged = 0;
    let summariesCreated = 0;

    // ── Step 1: Prune low-confidence entries ──────────────────────────────
    for (const entry of entries) {
      if (
        entry.confidence !== undefined &&
        entry.confidence < (this.config.confidenceThreshold ?? 0.3)
      ) {
        if (!this.config.dryRun) {
          await memory.delete(entry.id);
        }
        entriesPruned++;
      }
    }

    // ── Step 2: Build graph and find clusters ─────────────────────────────
    const activeEntries = entries.filter(
      (e) =>
        !e.confidence ||
        e.confidence >= (this.config.confidenceThreshold ?? 0.3)
    );
    const graph = MemoryGraph.fromEntries(activeEntries);
    const clusters = this.extractClusters(graph, activeEntries);

    let clustersUsed = 0;

    // ── Step 3: Merge clusters into summaries ─────────────────────────────
    for (const cluster of clusters) {
      if (cluster.length < (this.config.minClusterSize ?? 3)) continue;
      clustersUsed++;

      // Ask model to summarize the cluster
      const summary = await this.summarizeCluster(cluster);
      if (!summary) continue;

      if (!this.config.dryRun) {
        // Create a new high-confidence summary entry
        await memory.save({
          type: "reference",
          name: `consolidated-cluster-${Date.now()}`,
          description: summary.title,
          body: summary.body,
          tags: [...new Set(cluster.flatMap((e) => e.tags ?? []))].slice(0, 8),
          confidence: 0.85,
        });
        summariesCreated++;

        // Delete original cluster entries (replaced by summary)
        for (const entry of cluster) {
          await memory.delete(entry.id);
          entriesMerged++;
        }
      }
    }

    return {
      clustersFound: clustersUsed,
      entriesMerged,
      entriesPruned,
      summariesCreated,
      durationMs: Date.now() - startMs,
    };
  }

  private extractClusters(
    graph: MemoryGraph,
    entries: MemoryEntry[]
  ): MemoryEntry[][] {
    const entryMap = new Map(entries.map((e) => [e.id, e]));
    const visited = new Set<string>();
    const clusters: MemoryEntry[][] = [];

    for (const node of graph.toNodes()) {
      if (visited.has(node.id)) continue;

      const neighbors = graph.neighbors(node.id, 1);
      const cluster = [node, ...neighbors]
        .map((n) => entryMap.get(n.id))
        .filter((e): e is MemoryEntry => !!e);

      if (cluster.length >= (this.config.minClusterSize ?? 3)) {
        for (const e of cluster) visited.add(e.id);
        clusters.push(cluster);
      }
    }

    return clusters;
  }

  private async summarizeCluster(
    cluster: MemoryEntry[]
  ): Promise<{ title: string; body: string } | null> {
    const bodies = cluster
      .map((e) => `[${e.name}] ${e.description ?? ""}\n${(e.body ?? "").slice(0, 200)}`)
      .join("\n\n");

    try {
      const response = await this.engine.call({
        systemPrompt:
          "You are a memory consolidation assistant. Synthesize a group of related memory entries into one concise summary. " +
          'Return JSON: {"title":"short title (max 60 chars)","body":"summary (max 400 chars)"}',
        messages: [
          {
            role: "user",
            content: `Consolidate these ${cluster.length} related memory entries:\n\n${bodies}`,
          },
        ],
        tools: [],
        maxTokens: 512,
      });

      const text = response.content
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("");

      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return null;
      return JSON.parse(match[0]) as { title: string; body: string };
    } catch {
      return null;
    }
  }
}
