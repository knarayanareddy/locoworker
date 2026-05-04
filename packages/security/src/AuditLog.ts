import { MemorySystem } from "@cowork/core";
import path from "path";
import { mkdir } from "node:fs/promises";

export type AuditEventType =
  | "tool_call"
  | "tool_denied"
  | "approval_requested"
  | "approval_granted"
  | "approval_denied"
  | "session_start"
  | "session_end"
  | "memory_save"
  | "memory_delete"
  | "compact_triggered"
  | "permission_escalation"
  | "security_block"
  | "gateway_message"
  | "plugin_loaded"
  | "mcp_connected";

export interface AuditEntry {
  ts: string;
  sessionId: string;
  event: AuditEventType;
  actor: string;       // who triggered (user / agent / system)
  target?: string;     // what was acted on (tool name, memory id, etc.)
  details?: Record<string, unknown>;
  risk: "low" | "medium" | "high" | "critical";
}

export class AuditLog {
  private projectRoot: string;
  private sessionId: string;

  constructor(projectRoot: string, sessionId: string) {
    this.projectRoot = projectRoot;
    this.sessionId = sessionId;
  }

  async log(
    event: AuditEventType,
    opts: {
      actor: string;
      target?: string;
      details?: Record<string, unknown>;
      risk?: AuditEntry["risk"];
    }
  ): Promise<void> {
    const entry: AuditEntry = {
      ts: new Date().toISOString(),
      sessionId: this.sessionId,
      event,
      actor: opts.actor,
      target: opts.target,
      details: opts.details,
      risk: opts.risk ?? this.defaultRisk(event),
    };

    const dir = path.join(
      MemorySystem.rootFor(this.projectRoot),
      "audit"
    );
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `${entry.ts.slice(0, 10)}.jsonl`);
    const existing = await Bun.file(file).text().catch(() => "");
    await Bun.write(file, existing + JSON.stringify(entry) + "\n");
  }

  async query(opts: {
    date?: string;
    event?: AuditEventType;
    risk?: AuditEntry["risk"];
    limit?: number;
  }): Promise<AuditEntry[]> {
    const date = opts.date ?? new Date().toISOString().slice(0, 10);
    const file = path.join(
      MemorySystem.rootFor(this.projectRoot),
      "audit",
      `${date}.jsonl`
    );

    let entries: AuditEntry[];
    try {
      const raw = await Bun.file(file).text();
      entries = raw
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l) as AuditEntry);
    } catch {
      return [];
    }

    if (opts.event) entries = entries.filter((e) => e.event === opts.event);
    if (opts.risk) entries = entries.filter((e) => e.risk === opts.risk);
    return entries.slice(-(opts.limit ?? 100));
  }

  private defaultRisk(event: AuditEventType): AuditEntry["risk"] {
    const riskMap: Record<AuditEventType, AuditEntry["risk"]> = {
      tool_call: "low",
      tool_denied: "medium",
      approval_requested: "medium",
      approval_granted: "medium",
      approval_denied: "medium",
      session_start: "low",
      session_end: "low",
      memory_save: "low",
      memory_delete: "medium",
      compact_triggered: "low",
      permission_escalation: "high",
      security_block: "high",
      gateway_message: "low",
      plugin_loaded: "medium",
      mcp_connected: "medium",
    };
    return riskMap[event] ?? "low";
  }
}
