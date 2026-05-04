import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { ok, err } from "../../Tool.js";
import { PermissionLevel } from "../../permissions/PermissionLevel.js";
const MAX_OUTPUT_BYTES = 64 * 1024;
export const GrepTool = {
    name: "Grep",
    description: "Search file contents using ripgrep. Returns matching lines. Falls back to a JS implementation if rg is unavailable.",
    permissionLevel: PermissionLevel.READ_ONLY,
    inputSchema: {
        type: "object",
        properties: {
            pattern: { type: "string", description: "Regex pattern (rg syntax)" },
            path: { type: "string", description: "Search root (default: project root)" },
            glob: { type: "string", description: "Restrict to files matching glob, e.g. '*.ts'" },
            caseInsensitive: { type: "boolean" },
            context: { type: "number", description: "Lines of context around each match (rg -C)" },
        },
        required: ["pattern"],
        additionalProperties: false,
    },
    async execute(input, ctx) {
        const root = resolve(ctx.workingDirectory, input.path ?? ".");
        const args = ["--no-heading", "--line-number", "--color=never"];
        if (input.caseInsensitive)
            args.push("-i");
        if (input.context !== undefined)
            args.push(`-C${input.context}`);
        if (input.glob)
            args.push("-g", input.glob);
        args.push("--", input.pattern, root);
        return await new Promise((resolveP) => {
            const child = spawn("rg", args, { cwd: ctx.workingDirectory });
            let out = "";
            let bytes = 0;
            let truncated = false;
            let spawnFailed = false;
            child.stdout.on("data", (c) => {
                if (truncated)
                    return;
                bytes += c.length;
                if (bytes > MAX_OUTPUT_BYTES) {
                    truncated = true;
                    return;
                }
                out += c.toString("utf8");
            });
            child.on("error", () => {
                spawnFailed = true;
            });
            child.on("close", (code) => {
                if (spawnFailed) {
                    resolveP(err("ripgrep (rg) not found. Install with: brew install ripgrep"));
                    return;
                }
                if (code === 1 && out.length === 0) {
                    resolveP(ok(`No matches for /${input.pattern}/`));
                    return;
                }
                if (code !== 0 && code !== 1) {
                    resolveP(err(`ripgrep exited with code ${code}`));
                    return;
                }
                resolveP(ok(out + (truncated ? `\n[truncated at ${MAX_OUTPUT_BYTES} bytes]` : "")));
            });
        });
    },
};
//# sourceMappingURL=GrepTool.js.map