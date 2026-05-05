export type AuditEventKind =
  | "tool_call"
  | "tool_denied"
  | "tool_approved"
  | "session_start"
  | "session_end"
  | "permission_escalation"
  | "bash_command"
  | "file_write"
  | "file_delete"
  | "mcp_call"
  | "skill_execute";

export interface AuditEvent {
  id: string;
  kind: AuditEventKind;
  sessionId: string;
  projectRoot: string;
  timestamp: string;
  actor: "agent" | "user" | "system";
  toolName?: string;
  /** scrubbed input — never log raw secrets */
  inputSummary?: string;
  outcome: "allowed" | "denied" | "error" | "success";
  reason?: string;
  durationMs?: number;
}
