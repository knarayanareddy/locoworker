import type { ToolDefinition, ExecutionContext } from "../Tool.js";
export type PermissionCheck = {
    allowed: true;
} | {
    allowed: false;
    reason: string;
} | {
    allowed: "needs_approval";
    reason: string;
};
export declare class PermissionGate {
    /**
     * Compares the tool's required level with the session level. Tools that
     * declare requiresApproval=true always need explicit user approval.
     */
    static check(tool: ToolDefinition, ctx: ExecutionContext): PermissionCheck;
}
//# sourceMappingURL=PermissionGate.d.ts.map