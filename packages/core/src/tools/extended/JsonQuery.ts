import type { ToolDefinition } from "../../Tool.js";
import { PermissionLevel } from "../../permissions/PermissionLevel.js";

export const JsonQuery: ToolDefinition = {
  name: "JsonQuery",
  description: "Extract data from a JSON string or file using a simple dot-notation or logic.",
  inputSchema: {
    type: "object",
    properties: {
      json: { type: "string" },
      query: { type: "string", description: "e.g. 'users[0].name' or 'items.length'" },
    },
    required: ["json", "query"],
  },
  permissionLevel: PermissionLevel.READ_ONLY,
  async execute(input: { json: string; query: string }) {
    try {
      const data = JSON.parse(input.json);
      // Simple path evaluation
      const result = new Function("data", `return data.${input.query}`)(data);
      return { content: JSON.stringify(result, null, 2), isError: false };
    } catch (err) {
      return { content: String(err), isError: true };
    }
  },
};
