import type { ToolDefinition } from "../../Tool.js";
import { PermissionLevel } from "../../permissions/PermissionLevel.js";
import { Glob } from "bun";
import path from "path";

export const TreeView: ToolDefinition = {
  name: "TreeView",
  description: "Display a visual tree of the directory structure.",
  inputSchema: {
    type: "object",
    properties: {
      dir: { type: "string", default: "." },
      depth: { type: "number", default: 2 },
    },
  },
  permissionLevel: PermissionLevel.READ_ONLY,
  async execute(input: { dir?: string; depth?: number }, ctx) {
    const root = path.resolve(ctx.workingDirectory, input.dir ?? ".");
    const depth = input.depth ?? 2;
    const lines: string[] = [path.basename(root) + "/"];

    const glob = new Glob("**/*");
    for await (const file of glob.scan({ cwd: root, onlyFiles: false })) {
      const parts = file.split(path.sep);
      if (parts.length > depth) continue;
      const indent = "  ".repeat(parts.length);
      lines.push(`${indent}${parts[parts.length - 1]}`);
    }

    return { content: lines.join("\n"), isError: false };
  },
};
