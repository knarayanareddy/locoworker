import type { ToolDefinition } from "../../Tool.js";
import { PermissionLevel } from "../../permissions/PermissionLevel.js";
import path from "path";
import { guardPath } from "../files/pathGuard.js";

export const TodoRead: ToolDefinition = {
  name: "TodoRead",
  description: "Read the project TODO list.",
  inputSchema: { type: "object", properties: {} },
  permissionLevel: PermissionLevel.READ_ONLY,
  async execute(_, ctx) {
    const guarded = await guardPath(ctx.workingDirectory, "TODO.md");
    if (guarded.error) return { content: guarded.error, isError: true };
    const p = guarded.path!;
    try {
      const content = await Bun.file(p).text();
      return { content, isError: false };
    } catch {
      return { content: "No TODO.md found.", isError: false };
    }
  },
};

export const TodoWrite: ToolDefinition = {
  name: "TodoWrite",
  description: "Update the project TODO list.",
  inputSchema: {
    type: "object",
    properties: { content: { type: "string" } },
    required: ["content"],
  },
  permissionLevel: PermissionLevel.STANDARD,
  async execute(input: { content: string }, ctx) {
    const guarded = await guardPath(ctx.workingDirectory, "TODO.md");
    if (guarded.error) return { content: guarded.error, isError: true };
    const p = guarded.path!;
    await Bun.write(p, input.content);
    return { content: "TODO.md updated.", isError: false };
  },
};
