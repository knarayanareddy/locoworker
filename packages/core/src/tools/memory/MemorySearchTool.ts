import { type ToolDefinition, type ExecutionContext, type ToolResult, ok } from "../../Tool.js";
import { PermissionLevel } from "../../permissions/PermissionLevel.js";
import type { MemorySystem } from "../../memdir/MemorySystem.js";
import { MEMORY_TYPES, isMemoryType, type MemoryType } from "../../memdir/MemoryTypes.js";

type SearchInput = {
  query: string;
  type?: string;
  limit?: number;
};

export function makeMemorySearchTool(memory: MemorySystem): ToolDefinition<SearchInput> {
  return {
    name: "MemorySearch",
    description:
      "Search the long-term memory store using hybrid keyword + semantic ranking. Returns the most relevant entries with their bodies. Use this whenever you need to recall a past decision, user preference, or reference URL.",
    permissionLevel: PermissionLevel.READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural-language query" },
        type: { type: "string", description: `Optional filter — one of: ${MEMORY_TYPES.join(", ")}` },
        limit: { type: "number", description: "Max results (default 5)" },
      },
      required: ["query"],
      additionalProperties: false,
    },
    async execute(input, _ctx: ExecutionContext): Promise<ToolResult> {
      const filter: { type?: MemoryType } = {};
      if (input.type) {
        if (!isMemoryType(input.type)) {
          return ok(`Unknown type "${input.type}". Try one of: ${MEMORY_TYPES.join(", ")}`);
        }
        filter.type = input.type;
      }
      const limit = input.limit ?? 5;
      const results = await memory.query(input.query, limit, filter);
      if (results.length === 0) {
        return ok(`No memories match "${input.query}"`);
      }
      const formatted = results
        .map((r) => {
          return `── ${r.type}/${r.id}\n${r.name}\n${r.description}\n\n${r.body.slice(0, 1200)}`;
        })
        .join("\n\n");
      return ok(formatted);
    },
  };
}
