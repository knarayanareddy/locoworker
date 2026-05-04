import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { ok, err } from "../../Tool.js";
import { PermissionLevel } from "../../permissions/PermissionLevel.js";
const MAX_BYTES = 512 * 1024;
const DEFAULT_LIMIT = 2000;
export const ReadFileTool = {
    name: "Read",
    description: "Read a file from disk. Returns content with line numbers (cat -n style). Use offset/limit for large files.",
    permissionLevel: PermissionLevel.READ_ONLY,
    inputSchema: {
        type: "object",
        properties: {
            path: { type: "string", description: "Absolute or project-relative file path" },
            offset: { type: "number", description: "Line number to start reading from (1-indexed)" },
            limit: { type: "number", description: "Max lines to read (default 2000)" },
        },
        required: ["path"],
        additionalProperties: false,
    },
    async execute(input, ctx) {
        const fullPath = resolve(ctx.workingDirectory, input.path);
        let info;
        try {
            info = await stat(fullPath);
        }
        catch (e) {
            return err(`File not found: ${input.path}`);
        }
        if (!info.isFile())
            return err(`Not a file: ${input.path}`);
        if (info.size > MAX_BYTES) {
            return err(`File too large (${info.size} bytes, limit ${MAX_BYTES}). Use offset/limit to page.`);
        }
        const raw = await readFile(fullPath, "utf8");
        const lines = raw.split("\n");
        const offset = Math.max(0, (input.offset ?? 1) - 1);
        const limit = input.limit ?? DEFAULT_LIMIT;
        const slice = lines.slice(offset, offset + limit);
        const numbered = slice
            .map((line, i) => `${(offset + i + 1).toString().padStart(6)}\t${line}`)
            .join("\n");
        const trailer = offset + slice.length < lines.length
            ? `\n[showing lines ${offset + 1}-${offset + slice.length} of ${lines.length}]`
            : "";
        return ok(numbered + trailer);
    },
};
//# sourceMappingURL=ReadFileTool.js.map