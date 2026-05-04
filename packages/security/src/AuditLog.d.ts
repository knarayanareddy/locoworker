export type AuditEventType = "tool_call" | "tool_denied" | "approval_requested" | "approval_granted" | "approval_denied" | "session_start" | "session_end" | "memory_save" | "memory_delete" | "compact_triggered" | "permission_escalation" | "security_block" | "gateway_message" | "plugin_loaded" | "mcp_connected";
export interface AuditEntry {
    ts: string;
    sessionId: string;
    event: AuditEventType;
    actor: string;
    target?: string;
    details?: Record<string, unknown>;
    risk: "low" | "medium" | "high" | "critical";
}
export declare class AuditLog {
    private projectRoot;
    private sessionId;
    constructor(projectRoot: string, sessionId: string);
    log(event: AuditEventType, opts: {
        actor: string;
        target?: string;
        details?: Record<string, unknown>;
        risk?: AuditEntry["risk"];
    }): Promise<void>;
    query(opts: {
        date?: string;
        event?: AuditEventType;
        risk?: AuditEntry["risk"];
        limit?: number;
    }): Promise<AuditEntry[]>;
    private defaultRisk;
}
//# sourceMappingURL=AuditLog.d.ts.map