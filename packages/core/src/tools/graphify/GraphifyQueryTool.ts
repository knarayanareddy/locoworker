import { type ToolDefinition, type ExecutionContext, type ToolResult, ok, err } from "../../Tool.js";
import { PermissionLevel } from "../../permissions/PermissionLevel.js";
import type { GraphifySession } from "./GraphifySession.js";

type QueryOp = "search" | "node" | "neighbors" | "path" | "central";

type QueryInput = {
  op: QueryOp;
  /** For 'search'. */
  query?: string;
  /** For 'node' / 'neighbors' / 'path' (from). */
  nodeId?: string;
  /** For 'path' (to). */
  to?: string;
  /** For 'neighbors'. */
  depth?: number;
  /** For all returning lists. */
  limit?: number;
};

export function makeGraphifyQueryTool(session: GraphifySession): ToolDefinition<QueryInput> {
  return {
    name: "GraphifyQuery",
    description:
      "Query the project's knowledge graph. Operations:\n  • search   — find nodes by name/topic (BM25 over names + paths)\n  • node     — fetch a node by id\n  • neighbors — list nodes connected to a given node\n  • path     — shortest path between two node ids\n  • central  — list highest-centrality nodes\n\nNode ids look like 'file:packages/core/src/Tool.ts' or 'function:packages/foo/bar.ts:doThing@42'. Use this in place of Glob/Grep for navigation.",
    permissionLevel: PermissionLevel.READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        op: { type: "string", description: "search | node | neighbors | path | central" },
        query: { type: "string" },
        nodeId: { type: "string" },
        to: { type: "string" },
        depth: { type: "number" },
        limit: { type: "number" },
      },
      required: ["op"],
      additionalProperties: false,
    },

    async execute(input, _ctx: ExecutionContext): Promise<ToolResult> {
      const query = await session.ensureLoaded();
      if (!query) {
        return err(
          "No knowledge graph available. Run GraphifyBuild first to create graphify-out/graph.json.",
        );
      }

      const limit = input.limit ?? 10;

      switch (input.op) {
        case "search": {
          if (!input.query) return err("op=search requires a 'query' string");
          const hits = query.search(input.query, limit);
          if (hits.length === 0) return ok(`no matches for "${input.query}"`);
          return ok(
            hits
              .map(
                (h: any) =>
                  `${h.score.toFixed(3)}  ${h.node.kind.padEnd(10)} ${h.node.id}`,
              )
              .join("\n"),
          );
        }
        case "node": {
          if (!input.nodeId) return err("op=node requires 'nodeId'");
          const n = query.getNode(input.nodeId);
          if (!n) return err(`node not found: ${input.nodeId}`);
          return ok(JSON.stringify(n, null, 2));
        }
        case "neighbors": {
          if (!input.nodeId) return err("op=neighbors requires 'nodeId'");
          const list = query.getNeighbors({ nodeId: input.nodeId, depth: input.depth ?? 1 });
          if (list.length === 0) return ok(`no neighbors for ${input.nodeId}`);
          return ok(
            list
              .slice(0, limit)
              .map((n: any) => `${n.kind.padEnd(10)} ${n.id}`)
              .join("\n"),
          );
        }
        case "path": {
          if (!input.nodeId || !input.to) {
            return err("op=path requires 'nodeId' (from) and 'to'");
          }
          const path = query.shortestPath(input.nodeId, input.to);
          if (!path) return ok(`no path between ${input.nodeId} and ${input.to}`);
          return ok(path.map((n: any) => n.id).join("\n  → "));
        }
        case "central": {
          const top = query.topByCentrality(limit);
          return ok(
            top
              .map(
                (n: any) =>
                  `${(n.centrality ?? 0).toFixed(3)}  ${n.kind.padEnd(10)} ${n.id}`,
              )
              .join("\n"),
          );
        }
        default:
          return err(`unknown op: ${input.op}`);
      }
    },
  };
}
