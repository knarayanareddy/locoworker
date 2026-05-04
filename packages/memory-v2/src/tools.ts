import type { ToolDefinition, ToolContext } from "@cowork/core";
import { EpisodicMemory } from "./EpisodicMemory";
import { MemoryGraph } from "./MemoryGraph";
import { ConsolidationV2 } from "./ConsolidationV2";

export const EpisodeRecord: ToolDefinition = {
  name: "EpisodeRecord",
  description:
    "Record an episodic memory — a structured record of what just happened, " +
    "what was decided, or what was discovered. Use after completing significant tasks.",
  inputSchema: {
    type: "object",
    properties: {
      type: {
        type: "string",
        enum: ["task", "decision", "discovery", "error", "interaction", "insight"],
      },
      title: { type: "string", description: "Short title (max 80 chars)" },
      summary: { type: "string", description: "1–2 sentence summary" },
      entities: {
        type: "array",
        items: { type: "string" },
        description: "Key entities involved (files, functions, people, concepts)",
      },
      outcome: {
        type: "string",
        enum: ["success", "failure", "partial", "unknown"],
      },
      confidence: {
        type: "number",
        description: "Confidence 0–1 (default 0.8)",
      },
    },
    required: ["type", "title", "summary"],
  },
  permissionLevel: "STANDARD",
  async execute(
    input: {
      type: string;
      title: string;
      summary: string;
      entities?: string[];
      outcome?: string;
      confidence?: number;
    },
    ctx: ToolContext
  ) {
    const em = new EpisodicMemory(ctx.workingDirectory);
    const episode = await em.record({
      type: input.type as any,
      sessionId: "tool",
      title: input.title,
      summary: input.summary,
      entities: input.entities ?? [],
      outcome: (input.outcome as any) ?? "unknown",
      confidence: input.confidence ?? 0.8,
    });
    return { content: `Episode recorded: ${episode.id.slice(0, 8)} — ${episode.title}`, isError: false };
  },
};

export const EpisodeSearch: ToolDefinition = {
  name: "EpisodeSearch",
  description:
    "Search episodic memories (past task completions, decisions, discoveries).",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
      type: {
        type: "string",
        enum: ["task", "decision", "discovery", "error", "interaction", "insight"],
      },
      limit: { type: "number", description: "Max results (default 10)" },
    },
    required: [],
  },
  permissionLevel: "READ_ONLY",
  async execute(
    input: { query?: string; type?: string; limit?: number },
    ctx: ToolContext
  ) {
    const em = new EpisodicMemory(ctx.workingDirectory);
    let episodes = input.query
      ? await em.search(input.query, input.limit ?? 10)
      : input.type
      ? await em.byType(input.type as any, input.limit ?? 10)
      : await em.recent(input.limit ?? 10);

    if (episodes.length === 0) return { content: "No episodes found.", isError: false };

    const lines = episodes.map(
      (e) =>
        `**[${e.type}]** ${e.title} — ${e.outcome} (${(e.confidence * 100).toFixed(0)}%)\n  ${e.summary}\n  ${e.ts.slice(0, 10)}`
    );
    return { content: lines.join("\n\n"), isError: false };
  },
};

export const MemoryGraphQuery: ToolDefinition = {
  name: "MemoryGraphQuery",
  description:
    "Query the memory knowledge graph. " +
    "action: 'central' (most connected), 'neighbors <id>', 'path <from> <to>', 'stats'",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["central", "neighbors", "path", "stats"],
      },
      nodeId: { type: "string", description: "Memory entry ID (for neighbors/path)" },
      targetId: { type: "string", description: "Target ID (for path)" },
    },
    required: ["action"],
  },
  permissionLevel: "READ_ONLY",
  async execute(
    input: { action: string; nodeId?: string; targetId?: string },
    ctx: ToolContext
  ) {
    const graph = await MemoryGraph.build(ctx.workingDirectory);

    if (input.action === "stats") {
      const stats = graph.stats();
      return {
        content: [
          `Memory graph stats:`,
          `  Nodes: ${stats.nodeCount}`,
          `  Edges: ${stats.edgeCount}`,
          `  Avg degree: ${stats.avgDegree.toFixed(2)}`,
          `  Isolated nodes: ${stats.isolatedNodes}`,
          `  Clusters: ${stats.clusters}`,
        ].join("\n"),
        isError: false,
      };
    }

    if (input.action === "central") {
      const central = graph.central(10);
      const lines = central.map((n) => `- **${n.name}** (${n.type}) — ${n.tags.join(", ")}`);
      return { content: `## Most Connected Memory Nodes\n\n${lines.join("\n")}`, isError: false };
    }

    if (input.action === "neighbors" && input.nodeId) {
      const neighbors = graph.neighbors(input.nodeId, 1);
      if (neighbors.length === 0) return { content: `No neighbors for ${input.nodeId}`, isError: false };
      return {
        content: neighbors.map((n) => `- ${n.name} (${n.type})`).join("\n"),
        isError: false,
      };
    }

    if (input.action === "path" && input.nodeId && input.targetId) {
      const path = graph.shortestPath(input.nodeId, input.targetId);
      if (path.length === 0) return { content: "No path found.", isError: false };
      return {
        content: path.map((n) => n.name).join(" → "),
        isError: false,
      };
    }

    return { content: "Invalid action or missing parameters.", isError: true };
  },
};

export const ConsolidateV2: ToolDefinition = {
  name: "ConsolidateV2",
  description:
    "Run advanced graph-aware memory consolidation (ConsolidationV2). " +
    "Prunes low-confidence entries, detects clusters, and merges them into summaries. " +
    "More thorough than /dream. May take 1–2 minutes.",
  inputSchema: {
    type: "object",
    properties: {
      dryRun: {
        type: "boolean",
        description: "Preview changes without applying (default false)",
      },
      minClusterSize: {
        type: "number",
        description: "Min entries in a cluster to trigger merge (default 3)",
      },
    },
    required: [],
  },
  permissionLevel: "STANDARD",
  async execute(input: { dryRun?: boolean; minClusterSize?: number }, ctx: ToolContext) {
    const consolidation = new ConsolidationV2({
      projectRoot: ctx.workingDirectory,
      provider: ctx.settings?.provider ?? "ollama",
      model: ctx.settings?.model ?? "qwen2.5-coder:7b",
      dryRun: input.dryRun ?? false,
      minClusterSize: input.minClusterSize,
    });

    const report = await consolidation.run();
    return {
      content: [
        `## ConsolidationV2 ${input.dryRun ? "(dry run)" : "complete"}`,
        `Clusters found: ${report.clustersFound}`,
        `Entries merged: ${report.entriesMerged}`,
        `Entries pruned: ${report.entriesPruned}`,
        `Summaries created: ${report.summariesCreated}`,
        `Duration: ${(report.durationMs / 1000).toFixed(1)}s`,
      ].join("\n"),
      isError: false,
    };
  },
};

export const MEMORY_V2_TOOLS: ToolDefinition[] = [
  EpisodeRecord,
  EpisodeSearch,
  MemoryGraphQuery,
  ConsolidateV2,
];
