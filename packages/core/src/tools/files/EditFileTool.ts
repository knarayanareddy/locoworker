import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { type ToolDefinition, type ExecutionContext, type ToolResult, ok, err } from "../../Tool.js";
import { PermissionLevel } from "../../permissions/PermissionLevel.js";

type EditInput = {
  path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
};

export const EditFileTool: ToolDefinition<EditInput> = {
  name: "Edit",
  description:
    "Surgical string replacement in a file. Fails if old_string is not unique unless replace_all is true. Preserves indentation and line endings.",
  permissionLevel: PermissionLevel.CONSTRAINED,
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "File to edit" },
      old_string: { type: "string", description: "Exact text to replace" },
      new_string: { type: "string", description: "Replacement text (must differ from old_string)" },
      replace_all: { type: "boolean", description: "Replace every occurrence instead of failing on duplicates" },
    },
    required: ["path", "old_string", "new_string"],
    additionalProperties: false,
  },

  async execute(input: EditInput, ctx: ExecutionContext): Promise<ToolResult> {
    if (input.old_string === input.new_string) {
      return err("old_string and new_string must differ");
    }

    const fullPath = resolve(ctx.workingDirectory, input.path);

    let original: string;
    try {
      original = await readFile(fullPath, "utf8");
    } catch {
      return err(`File not found: ${input.path}`);
    }

    const occurrences = countOccurrences(original, input.old_string);
    if (occurrences === 0) {
      return err(`old_string not found in ${input.path}`);
    }
    if (occurrences > 1 && !input.replace_all) {
      return err(
        `old_string occurs ${occurrences} times. Provide more context or set replace_all=true.`,
      );
    }

    const updated = input.replace_all
      ? original.split(input.old_string).join(input.new_string)
      : original.replace(input.old_string, input.new_string);

    try {
      await writeFile(fullPath, updated, "utf8");
      const replacements = input.replace_all ? occurrences : 1;
      return ok(`Edited ${input.path} (${replacements} replacement${replacements === 1 ? "" : "s"})`);
    } catch (e) {
      return err(`Write failed: ${(e as Error).message}`);
    }
  },
};

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}
