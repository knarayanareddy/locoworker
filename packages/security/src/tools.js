import { AuditLog } from "./AuditLog";
export const AuditQuery = {
    name: "AuditQuery",
    description: "Query the session audit log. View recent security events, tool calls, " +
        "approvals, and permission escalations. Useful for reviewing what the agent has done.",
    inputSchema: {
        type: "object",
        properties: {
            date: { type: "string", description: "YYYY-MM-DD (default today)" },
            event: {
                type: "string",
                description: "Filter by event type (tool_call, security_block, approval_denied, etc.)",
            },
            risk: {
                type: "string",
                enum: ["low", "medium", "high", "critical"],
            },
            limit: { type: "number", description: "Max entries (default 50)" },
        },
        required: [],
    },
    permissionLevel: "READ_ONLY",
    async execute(input, ctx) {
        const log = new AuditLog(ctx.workingDirectory, "audit-tool");
        const entries = await log.query({
            date: input.date,
            event: input.event,
            risk: input.risk,
            limit: input.limit ?? 50,
        });
        if (entries.length === 0) {
            return { content: "No audit entries found for the given filters.", isError: false };
        }
        const lines = entries.map((e) => `[${e.ts}] ${e.risk.toUpperCase().padEnd(8)} ${e.event.padEnd(25)} actor=${e.actor}${e.target ? ` target=${e.target}` : ""}`);
        return { content: lines.join("\n"), isError: false };
    },
};
export const SECURITY_TOOLS = [AuditQuery];
//# sourceMappingURL=tools.js.map