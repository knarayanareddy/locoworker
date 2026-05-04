import { Glob } from "bun";
import { resolve } from "node:path";
import { ok } from "../../Tool.js";
import { PermissionLevel } from "../../permissions/PermissionLevel.js";
const MAX_RESULTS = 500;
export const GlobTool = {
    name: "Glob",
    description: "Find files by pattern (e.g. 'src/**/*.ts'). Returns up to 500 paths sorted by name. Honors .gitignore.",
    permissionLevel: PermissionLevel.READ_ONLY,
    inputSchema: {
        type: "object",
        properties: {
            pattern: { type: "string", description: "Glob pattern, e.g. 'src/**/*.ts'" },
            cwd: { type: "string", description: "Search root (default: project root)" },
        },
        required: ["pattern"],
        additionalProperties: false,
    },
    async execute(input, ctx) {
        const root = resolve(ctx.workingDirectory, input.cwd ?? ".");
        const glob = new Glob(input.pattern);
        const matches = [];
        for await (const m of glob.scan({ cwd: root, dot: false, absolute: false })) {
            // Skip the standard heavy directories.
            if (m.includes("node_modules/") || m.includes(".git/"))
                continue;
            matches.push(m);
            if (matches.length >= MAX_RESULTS)
                break;
        }
        matches.sort();
        if (matches.length === 0)
            return ok(`No files match "${input.pattern}"`);
        const trailer = matches.length >= MAX_RESULTS ? `\n[truncated at ${MAX_RESULTS} results]` : "";
        return ok(matches.join("\n") + trailer);
    },
};
//# sourceMappingURL=GlobTool.js.map