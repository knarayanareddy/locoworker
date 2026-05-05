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
        const builder = new KnowledgeGraphBuilder();
        const result = await builder.build({ rootDir: root });
        const { graph } = result;

        // Save to storage
        const storage = new GraphStorage(outDir);
        const snapshot = graph.toSnapshot({
          builtAt: new Date().toISOString(),
          rootDir: root,
          fileCount: result.filesProcessed,
          nodeCount: result.nodesCreated,
          edgeCount: result.edgesCreated,
          languages: [],
          totalSourceBytes: 0,
        });
        await storage.save(snapshot);

        const reportContent = buildGraphReport(result, root);
        await storage.writeReport(reportContent);

        session.set(graph, root);

        return ok(
          [
            `Built graph: ${result.nodesCreated} nodes, ${result.edgesCreated} edges, ${result.filesProcessed} files.`,
            `Output: ${outDir}/graph.json + ${outDir}/GRAPH_REPORT.md`,
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
