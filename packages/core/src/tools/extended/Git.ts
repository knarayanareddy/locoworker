import { spawn } from "bun";
import type { ToolDefinition } from "../../Tool.js";
import { PermissionLevel } from "../../permissions/PermissionLevel.js";

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
  description: "Commit explicitly listed files with a message. Requires approval.",
  inputSchema: {
    type: "object",
    properties: {
      message: { type: "string" },
      files: {
        type: "array",
        items: { type: "string" },
        description: "Paths to stage (git add . is never used)",
      },
    },
    required: ["message", "files"],
  },
  permissionLevel: PermissionLevel.ELEVATED,
  requiresApproval: true,
  async execute(input: { message: string; files: string[] }, ctx) {
    if (!Array.isArray(input.files) || input.files.length === 0) {
      return { content: "GitCommit requires an explicit non-empty `files` list.", isError: true };
    }
    for (const file of input.files) {
      if (file.startsWith("-") || file.includes("\0")) {
        return { content: `Invalid path: ${file}`, isError: true };
      }
    }
    const add = await runGit(["add", "--", ...input.files], ctx.workingDirectory);
    if (add.isError) return add;
    return runGit(["commit", "-m", input.message], ctx.workingDirectory);
  },
};
