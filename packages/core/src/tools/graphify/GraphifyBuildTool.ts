import { resolve } from "node:path";
import {
  KnowledgeGraphBuilder,
  GraphStorage,
  buildGraphReport,
} from "@cowork/graphify";
import { type ToolDefinition, type ExecutionContext, type ToolResult, ok, err } from "../../Tool.js";
import { PermissionLevel } from "../../permissions/PermissionLevel.js";
import type { GraphifySession } from "./GraphifySession.js";

type BuildInput = {
  path?: string;
  output?: string;
};

export function makeGraphifyBuildTool(session: GraphifySession): ToolDefinition<BuildInput> {
  return {
    name: "GraphifyBuild",
    description:
      "Build (or rebuild) the knowledge graph for the project. Writes graphify-out/graph.json and graphify-out/GRAPH_REPORT.md. Use this once at the start of a navigation-heavy task. After this completes, prefer GraphifyQuery over Glob/Grep.",
    permissionLevel: PermissionLevel.READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Project root (default: working directory)" },
        output: {
          type: "string",
          description: "Output dir (default: graphify-out/ inside the project)",
        },
      },
      additionalProperties: false,
    },

    async execute(input, ctx: ExecutionContext): Promise<ToolResult> {
      const root = resolve(ctx.workingDirectory, input.path ?? ".");
      const outDir = resolve(root, input.output ?? "graphify-out");
      try {
        const builder = new KnowledgeGraphBuilder({
          projectRoot: root,
          outputDir: outDir,
        });
        const result = await builder.build();
        const { snapshot, graph } = result;

        const storage = new GraphStorage(outDir);
        // builder.build already saves snapshot, but we'll be explicit if needed.
        // await storage.save(snapshot); 

        const report = buildGraphReport(graph, snapshot);
        await storage.writeReport(report.markdown);

        session.set(graph, root);

        const tokensRaw = Math.ceil((snapshot.metadata as any).totalSourceBytes / 4) || 0;
        const tokensReport = Math.ceil(report.markdown.length / 4);
        const ratio = tokensReport > 0 ? (tokensRaw / tokensReport).toFixed(1) : "∞";

        return ok(
          [
            `Built graph: ${result.nodeCount} nodes, ${result.edgeCount} edges, ${result.filesProcessed} files.`,
            `Output: ${outDir}/graph.json + ${outDir}/GRAPH_REPORT.md`,
            `Token reduction: ~${tokensRaw.toLocaleString()} raw tokens → ~${tokensReport.toLocaleString()} report tokens (${ratio}x).`,
            "",
            `Next: read GRAPH_REPORT.md before navigating, then use GraphifyQuery for symbol/path lookups.`,
          ].join("\n"),
        );
      } catch (e) {
        return err(`Graph build failed: ${(e as Error).message}`);
      }
    },
  };
}
