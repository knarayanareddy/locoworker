import { ok } from "../../Tool.js";
import { PermissionLevel } from "../../permissions/PermissionLevel.js";
import { MEMORY_TYPES, isMemoryType } from "../../memdir/MemoryTypes.js";
export function makeMemorySearchTool(memory) {
    return {
        name: "MemorySearch",
        description: "Search the long-term memory store using hybrid keyword + semantic ranking. Returns the most relevant entries with their bodies. Use this whenever you need to recall a past decision, user preference, or reference URL.",
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
        async execute(input, _ctx) {
            const filter = {};
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
                const via = r.via.join("+");
                return `── ${r.entry.type}/${r.entry.id} (score=${r.score.toFixed(3)}, via=${via})\n${r.entry.name}\n${r.entry.description}\n\n${r.entry.body.slice(0, 1200)}`;
            })
                .join("\n\n");
            return ok(formatted);
        },
    };
}
//# sourceMappingURL=MemorySearchTool.js.map