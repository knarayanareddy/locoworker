import { ok, err } from "../../Tool.js";
import { PermissionLevel } from "../../permissions/PermissionLevel.js";
import { MEMORY_TYPES, isMemoryType, DESCRIPTIONS } from "../../memdir/MemoryTypes.js";
export function makeMemorySaveTool(memory, sessionId) {
    return {
        name: "MemorySave",
        description: `Save a long-term memory. Memories persist across sessions and are auto-loaded into the system context. Pick the right type:\n\n${MEMORY_TYPES.map((t) => `  • ${t} — ${DESCRIPTIONS[t]}`).join("\n")}\n\nKeep entries focused — one fact, decision, or preference per memory.`,
        permissionLevel: PermissionLevel.CONSTRAINED,
        inputSchema: {
            type: "object",
            properties: {
                type: { type: "string", description: `One of: ${MEMORY_TYPES.join(", ")}` },
                name: { type: "string", description: "Short title (becomes filename)" },
                description: {
                    type: "string",
                    description: "One-line hook used in MEMORY.md — make it specific and searchable",
                },
                body: { type: "string", description: "Full memory content (Markdown)" },
                tags: { type: "array", description: "Optional tags for filtering" },
            },
            required: ["type", "name", "description", "body"],
            additionalProperties: false,
        },
        async execute(input, _ctx) {
            if (!isMemoryType(input.type)) {
                return err(`Unknown memory type "${input.type}". Use one of: ${MEMORY_TYPES.join(", ")}`);
            }
            const entry = await memory.save({
                type: input.type,
                name: input.name,
                description: input.description,
                body: input.body,
                tags: input.tags ?? [],
                sessionId,
                confidence: 1,
            });
            return ok(`Saved ${entry.type}/${entry.id}: ${entry.name}`);
        },
    };
}
//# sourceMappingURL=MemorySaveTool.js.map