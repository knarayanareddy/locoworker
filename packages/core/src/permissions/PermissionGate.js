import { PermissionLevel, levelName } from "./PermissionLevel.js";
export class PermissionGate {
    /**
     * Compares the tool's required level with the session level. Tools that
     * declare requiresApproval=true always need explicit user approval.
     */
    static check(tool, ctx) {
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
//# sourceMappingURL=PermissionGate.js.map