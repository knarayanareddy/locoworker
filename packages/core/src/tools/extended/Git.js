import { PermissionLevel } from "../../permissions/PermissionLevel.js";
import { spawn } from "bun";
async function runGit(args, cwd) {
    const proc = spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
    const out = await new Response(proc.stdout).text();
    const err = await new Response(proc.stderr).text();
    await proc.exited;
    return { content: out || err, isError: proc.exitCode !== 0 };
}
export const GitStatus = {
    name: "GitStatus",
    description: "Show git status.",
    inputSchema: { type: "object", properties: {} },
    permissionLevel: PermissionLevel.READ_ONLY,
    async execute(_, ctx) {
        return runGit(["status"], ctx.workingDirectory);
    },
};
export const GitLog = {
    name: "GitLog",
    description: "Show git log.",
    inputSchema: {
        type: "object",
        properties: { n: { type: "number", default: 10 } },
    },
    permissionLevel: PermissionLevel.READ_ONLY,
    async execute(input, ctx) {
        return runGit(["log", "-n", String(input.n ?? 10), "--oneline"], ctx.workingDirectory);
    },
};
export const GitDiff = {
    name: "GitDiff",
    description: "Show git diff.",
    inputSchema: { type: "object", properties: {} },
    permissionLevel: PermissionLevel.READ_ONLY,
    async execute(_, ctx) {
        return runGit(["diff"], ctx.workingDirectory);
    },
};
export const GitCommit = {
    name: "GitCommit",
    description: "Commit changes with a message.",
    inputSchema: {
        type: "object",
        properties: { message: { type: "string" } },
        required: ["message"],
    },
    permissionLevel: PermissionLevel.STANDARD,
    async execute(input, ctx) {
        await runGit(["add", "."], ctx.workingDirectory);
        return runGit(["commit", "-m", input.message], ctx.workingDirectory);
    },
};
//# sourceMappingURL=Git.js.map