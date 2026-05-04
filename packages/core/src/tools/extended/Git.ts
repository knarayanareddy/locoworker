import type { ToolDefinition } from "../../Tool.js";
import { PermissionLevel } from "../../permissions/PermissionLevel.js";
import { spawn } from "bun";

async function runGit(args: string[], cwd: string) {
  const proc = spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const out = await new Response(proc.stdout).text();
  const err = await new Response(proc.stderr).text();
  await proc.exited;
  return { content: out || err, isError: proc.exitCode !== 0 };
}

export const GitStatus: ToolDefinition = {
  name: "GitStatus",
  description: "Show git status.",
  inputSchema: { type: "object", properties: {} },
  permissionLevel: PermissionLevel.READ_ONLY,
  async execute(_, ctx) {
    return runGit(["status"], ctx.workingDirectory);
  },
};

export const GitLog: ToolDefinition = {
  name: "GitLog",
  description: "Show git log.",
  inputSchema: {
    type: "object",
    properties: { n: { type: "number", default: 10 } },
  },
  permissionLevel: PermissionLevel.READ_ONLY,
  async execute(input: { n?: number }, ctx) {
    return runGit(["log", "-n", String(input.n ?? 10), "--oneline"], ctx.workingDirectory);
  },
};

export const GitDiff: ToolDefinition = {
  name: "GitDiff",
  description: "Show git diff.",
  inputSchema: { type: "object", properties: {} },
  permissionLevel: PermissionLevel.READ_ONLY,
  async execute(_, ctx) {
    return runGit(["diff"], ctx.workingDirectory);
  },
};

export const GitCommit: ToolDefinition = {
  name: "GitCommit",
  description: "Commit changes with a message.",
  inputSchema: {
    type: "object",
    properties: { message: { type: "string" } },
    required: ["message"],
  },
  permissionLevel: PermissionLevel.STANDARD,
  async execute(input: { message: string }, ctx) {
    await runGit(["add", "."], ctx.workingDirectory);
    return runGit(["commit", "-m", input.message], ctx.workingDirectory);
  },
};
