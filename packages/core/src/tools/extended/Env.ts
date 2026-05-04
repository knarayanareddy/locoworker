import type { ToolDefinition } from "../../Tool.js";
import { PermissionLevel } from "../../permissions/PermissionLevel.js";

export const EnvRead: ToolDefinition = {
  name: "EnvRead",
  description: "Read environment variables.",
  inputSchema: {
    type: "object",
    properties: { name: { type: "string" } },
  },
  permissionLevel: PermissionLevel.READ_ONLY,
  async execute(input: { name?: string }) {
    if (input.name) {
      return { content: `${input.name}=${process.env[input.name] ?? ""}`, isError: false };
    }
    const vars = Object.keys(process.env).map(k => `${k}=${process.env[k]}`).join("\n");
    return { content: vars.slice(0, 50000), isError: false };
  },
};
