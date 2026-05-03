import { mkdir, writeFile, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { type ToolDefinition, type ExecutionContext, type ToolResult, ok, err } from "../../Tool.js";
import { PermissionLevel } from "../../permissions/PermissionLevel.js";

type WriteInput = {
  path: string;
  content: string;
};

export const WriteFileTool: ToolDefinition<WriteInput> = {
  name: "Write",
  description:
    "Write a file to disk, creating parent directories if needed. Overwrites existing files. Prefer Edit for modifying existing files.",
  permissionLevel: PermissionLevel.CONSTRAINED,
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Absolute or project-relative file path" },
      content: { type: "string", description: "Full file contents" },
    },
    required: ["path", "content"],
    additionalProperties: false,
  },

  async execute(input: WriteInput, ctx: ExecutionContext): Promise<ToolResult> {
    const fullPath = resolve(ctx.workingDirectory, input.path);

    let existed = false;
    let prevSize = 0;
    try {
      const info = await stat(fullPath);
      existed = info.isFile();
      prevSize = info.size;
    } catch {
      // File does not exist yet — that's fine.
    }

    try {
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, input.content, "utf8");
      const verb = existed ? `Overwrote (was ${prevSize} bytes)` : "Created";
      return ok(`${verb} ${input.path} (${input.content.length} chars)`);
    } catch (e) {
      return err(`Write failed: ${(e as Error).message}`);
    }
  },
};
