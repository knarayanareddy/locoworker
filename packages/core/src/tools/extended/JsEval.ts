import type { ToolDefinition } from "../../Tool.js";
import { PermissionLevel } from "../../permissions/PermissionLevel.js";

/**
 * Disabled: evaluating model-supplied JavaScript with `eval` gives the model
 * full access to the host process (filesystem, env, network). Kept as an
 * explicit, inert tool so existing tool lists still resolve, but it can never
 * execute code. Implement a sandboxed worker before re-enabling.
 */
export const JsEval: ToolDefinition = {
  name: "JsEval",
  description: "Disabled for security: arbitrary JavaScript evaluation is not available.",
  inputSchema: {
    type: "object",
    properties: { code: { type: "string" } },
    required: ["code"],
  },
  permissionLevel: PermissionLevel.DANGEROUS,
  requiresApproval: true,
  async execute() {
    return {
      content: "JsEval is disabled: executing model-supplied JavaScript in the host process is not permitted.",
      isError: true,
    };
  },
};
