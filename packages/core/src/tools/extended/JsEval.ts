import type { ToolDefinition } from "../../Tool.js";
import { PermissionLevel } from "../../permissions/PermissionLevel.js";

export const JsEval: ToolDefinition = {
  name: "JsEval",
  description: "Evaluate a JavaScript expression or block. Elevated permission required.",
  inputSchema: {
    type: "object",
    properties: { code: { type: "string" } },
    required: ["code"],
  },
  permissionLevel: PermissionLevel.ELEVATED,
  async execute(input: { code: string }) {
    try {
      // Use eval carefully, this is for the agent to run complex logic
      const result = eval(input.code);
      return { content: JSON.stringify(result, null, 2), isError: false };
    } catch (err) {
      return { content: String(err), isError: true };
    }
  },
};
