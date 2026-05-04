import { spawn } from "node:child_process";
import { err } from "../../Tool.js";
import { PermissionLevel } from "../../permissions/PermissionLevel.js";
import { checkBashCommand } from "./BashSecurity.js";
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 256 * 1024;
export const BashTool = {
    name: "Bash",
    description: "Execute a shell command. Output is truncated at ~256KB. Long-running commands are killed at the timeout. Use for: running tests, git commands, build tools.",
    permissionLevel: PermissionLevel.STANDARD,
    inputSchema: {
        type: "object",
        properties: {
            command: { type: "string", description: "The shell command to run" },
            timeout: {
                type: "number",
                description: "Timeout in milliseconds (default 30000, max 600000)",
            },
            cwd: { type: "string", description: "Working directory (relative to project root)" },
        },
        required: ["command"],
        additionalProperties: false,
    },
    async execute(input, ctx) {
        const security = checkBashCommand(input.command);
        if (!security.safe) {
            return err(`Blocked by security check: ${security.reason}`);
        }
        const timeout = clamp(input.timeout ?? DEFAULT_TIMEOUT_MS, 1_000, 600_000);
        const cwd = input.cwd ?? ctx.workingDirectory;
        return await new Promise((resolve) => {
            const child = spawn("/bin/bash", ["-c", input.command], {
                cwd,
                env: process.env,
            });
            let stdout = "";
            let stderr = "";
            let truncated = false;
            let bytes = 0;
            const append = (chunk, target) => {
                if (truncated)
                    return;
                bytes += chunk.length;
                if (bytes > MAX_OUTPUT_BYTES) {
                    truncated = true;
                    return;
                }
                if (target === "stdout")
                    stdout += chunk.toString("utf8");
                else
                    stderr += chunk.toString("utf8");
            };
            child.stdout.on("data", (c) => append(c, "stdout"));
            child.stderr.on("data", (c) => append(c, "stderr"));
            const timer = setTimeout(() => {
                child.kill("SIGKILL");
            }, timeout);
            const onAbort = () => child.kill("SIGKILL");
            ctx.abortSignal?.addEventListener("abort", onAbort, { once: true });
            child.on("close", (code, signal) => {
                clearTimeout(timer);
                ctx.abortSignal?.removeEventListener("abort", onAbort);
                const parts = [];
                if (stdout)
                    parts.push(`<stdout>\n${stdout}\n</stdout>`);
                if (stderr)
                    parts.push(`<stderr>\n${stderr}\n</stderr>`);
                if (truncated)
                    parts.push(`[output truncated at ${MAX_OUTPUT_BYTES} bytes]`);
                parts.push(`<exit>${signal ?? code ?? 0}</exit>`);
                const failed = (code ?? 0) !== 0 || signal !== null;
                resolve({ content: parts.join("\n"), isError: failed });
            });
            child.on("error", (e) => {
                clearTimeout(timer);
                resolve(err(`Failed to spawn bash: ${e.message}`));
            });
        });
    },
};
function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
}
//# sourceMappingURL=BashTool.js.map