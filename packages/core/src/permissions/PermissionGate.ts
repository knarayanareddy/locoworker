import { PermissionLevel, levelName } from "./PermissionLevel.js";
import type { ToolDefinition, ExecutionContext } from "../Tool.js";

export type PermissionCheck =
  | { allowed: true }
  | { allowed: false; reason: string }
  | { allowed: "needs_approval"; reason: string };

export class PermissionGate {
  /**
   * Compares the tool's required level with the session level. Tools that
   * declare requiresApproval=true always need explicit user approval.
   * Any invalid/missing level fails closed.
   */
  static check(tool: ToolDefinition, ctx: ExecutionContext): PermissionCheck {
    if (!Number.isInteger(ctx.permissionLevel) || ctx.permissionLevel < 0 || ctx.permissionLevel > PermissionLevel.DANGEROUS) {
      return {
        allowed: false,
        reason: `Invalid session permission level (${String(ctx.permissionLevel)}); refusing tool "${tool.name}"`,
      };
    }

    if (!Number.isInteger(tool.permissionLevel) || tool.permissionLevel < PermissionLevel.READ_ONLY || tool.permissionLevel > PermissionLevel.DANGEROUS) {
      return {
        allowed: false,
        reason: `Tool "${tool.name}" has no valid permission level; refusing it`,
      };
    }

    if (ctx.permissionLevel < tool.permissionLevel) {
      return {
        allowed: false,
        reason: `Tool "${tool.name}" requires ${levelName(tool.permissionLevel)} (session is ${levelName(ctx.permissionLevel)})`,
      };
    }

    if (tool.requiresApproval) {
      return {
        allowed: "needs_approval",
        reason: `Tool "${tool.name}" requires explicit approval`,
      };
    }

    if (tool.permissionLevel >= PermissionLevel.DANGEROUS) {
      return {
        allowed: "needs_approval",
        reason: `Tool "${tool.name}" is at DANGEROUS level`,
      };
    }

    return { allowed: true };
  }
}
