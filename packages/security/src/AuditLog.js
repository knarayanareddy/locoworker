import { MemorySystem } from "@cowork/core";
import path from "path";
import { mkdir } from "node:fs/promises";
export class AuditLog {
    projectRoot;
    sessionId;
    constructor(projectRoot, sessionId) {
        this.projectRoot = projectRoot;
        this.sessionId = sessionId;
    }
    async log(event, opts) {
        const entry = {
            ts: new Date().toISOString(),
            sessionId: this.sessionId,
            event,
            actor: opts.actor,
            target: opts.target,
            details: opts.details,
            risk: opts.risk ?? this.defaultRisk(event),
        };
        const dir = path.join(MemorySystem.rootFor(this.projectRoot), "audit");
        await mkdir(dir, { recursive: true });
        const file = path.join(dir, `${entry.ts.slice(0, 10)}.jsonl`);
        const existing = await Bun.file(file).text().catch(() => "");
        await Bun.write(file, existing + JSON.stringify(entry) + "\n");
    }
    async query(opts) {
        const date = opts.date ?? new Date().toISOString().slice(0, 10);
        const file = path.join(MemorySystem.rootFor(this.projectRoot), "audit", `${date}.jsonl`);
        let entries;
        try {
            const raw = await Bun.file(file).text();
            entries = raw
                .split("\n")
                .filter(Boolean)
                .map((l) => JSON.parse(l));
        }
        catch {
            return [];
        }
        if (opts.event)
            entries = entries.filter((e) => e.event === opts.event);
        if (opts.risk)
            entries = entries.filter((e) => e.risk === opts.risk);
        return entries.slice(-(opts.limit ?? 100));
    }
    defaultRisk(event) {
        const riskMap = {
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
//# sourceMappingURL=AuditLog.js.map