import { ok, err } from "../../Tool.js";
import { PermissionLevel } from "../../permissions/PermissionLevel.js";
import { MEMORY_TYPES, isMemoryType } from "../../memdir/MemoryTypes.js";
export function makeMemoryDeleteTool(memory) {
    return {
        name: "MemoryDelete",
        description: "Delete a stored memory by type and id. Use this when a memory is contradicted, no longer applicable, or was saved in error.",
        permissionLevel: PermissionLevel.CONSTRAINED,
        inputSchema: {
            type: "object",
            properties: {
                type: { type: "string", description: `One of: ${MEMORY_TYPES.join(", ")}` },
                id: { type: "string", description: "The memory id (filename without .md)" },
            },
            required: ["type", "id"],
            additionalProperties: false,
        },
        async execute(input, _ctx) {
            if (!isMemoryType(input.type)) {
                return err(`Unknown type "${input.type}"`);
            }
            const deleted = await memory.delete(input.type, input.id);
            return deleted
                ? ok(`Deleted ${input.type}/${input.id}`)
                : err(`Not found: ${input.type}/${input.id}`);
        },
    };
}
//# sourceMappingURL=MemoryDeleteTool.js.map