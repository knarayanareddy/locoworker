import type { ToolDefinition } from "../../Tool.js";
import { PermissionLevel } from "../../permissions/PermissionLevel.js";
import path from "path";

export const DiffApply: ToolDefinition = {
  name: "DiffApply",
  description: "Apply a unified diff to a file.",
  inputSchema: {
    type: "object",
    properties: {
      filePath: { type: "string" },
      diff: { type: "string" },
    },
    required: ["filePath", "diff"],
  },
  permissionLevel: PermissionLevel.STANDARD,
  async execute(input: { filePath: string; diff: string }, ctx) {
    const absPath = path.resolve(ctx.workingDirectory, input.filePath);
    try {
      const content = await Bun.file(absPath).text();
      // Very simple diff applier (placeholder logic, actual diff apply is complex)
      // For Phase 3 we'll assume a simple line-by-line or just use 'patch' command if available.
      const { spawn } = await import("bun");
      const proc = spawn(["patch", absPath], { stdin: "pipe" });
      if (proc.stdin && typeof proc.stdin !== "number") {
        proc.stdin.write(input.diff);
        proc.stdin.end();
      }
      await proc.exited;
      return { content: `Diff applied to ${input.filePath}`, isError: proc.exitCode !== 0 };
    } catch (err) {
      return { content: String(err), isError: true };
    }
  },
};
