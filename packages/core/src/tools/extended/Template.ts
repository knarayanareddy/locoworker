import type { ToolDefinition } from "../../Tool.js";
import { PermissionLevel } from "../../permissions/PermissionLevel.js";
import path from "path";

export const TemplateRender: ToolDefinition = {
  name: "TemplateRender",
  description: "Render a template string using {{variable}} substitution.",
  inputSchema: {
    type: "object",
    properties: {
      template: { type: "string" },
      variables: { type: "object", additionalProperties: { type: "string" } },
      isFilePath: { type: "boolean" },
    },
    required: ["template", "variables"],
  },
  permissionLevel: PermissionLevel.READ_ONLY,
  async execute(input: { template: string; variables: Record<string, string>; isFilePath?: boolean }, ctx) {
    let source = input.template;
    if (input.isFilePath) {
      const p = path.resolve(ctx.workingDirectory, input.template);
      source = await Bun.file(p).text();
    }
    const rendered = source.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return input.variables[key] ?? `{{${key}}}`;
    });
    return { content: rendered, isError: false };
  },
};
