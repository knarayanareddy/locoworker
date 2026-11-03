import { join } from "node:path";
import { homedir } from "node:os";
import { mkdir, appendFile, readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { scrubSecrets } from "../scrub/SecretScrubber.js";
import { getCoworkHome } from "./coworkHome.js";
import type { AuditEvent, AuditEventKind } from "./types.js";

export type AuditLogOptions = { sessionId: string; projectRoot: string };

export class AuditLog {
  private logPath: string;
  private sessionId: string;
  private projectRoot: string;

  constructor(opts: AuditLogOptions) {
    this.sessionId = opts.sessionId;
    this.projectRoot = opts.projectRoot;
    const today = new Date().toISOString().slice(0, 10);
    this.logPath = join(getCoworkHome(), "audit", `${today}.ndjson`);
  }

  /** Directory that holds all audit logs (used by the dashboard/CLI). */
  get auditDir(): string {
    return join(getCoworkHome(), "audit");
  }

  get path(): string {
    return this.logPath;
  }

  async init(): Promise<void> {
    await mkdir(this.auditDir, { recursive: true });
  }

  /**
   * Read audit events, newest last. `limit` counts entries, not files.
   * This is the API the dashboard and /audit slash command rely on.
   */
  async read(limit = 200): Promise<AuditEvent[]> {
    let files: string[];
    try {
      files = (await readdir(this.auditDir)).filter((f) => f.endsWith(".ndjson")).sort();
    } catch {
      return [];
    }
    const events: AuditEvent[] = [];
    for (const file of files) {
      try {
        const raw = await readFile(join(this.auditDir, file), "utf-8");
        for (const line of raw.split("\n")) {
          if (!line.trim()) continue;
          try {
            events.push(JSON.parse(line) as AuditEvent);
          } catch {
            // ignore a malformed line rather than losing the whole log
          }
        }
      } catch {
        // unreadable file — skip
      }
    }
    return limit > 0 ? events.slice(-limit) : events;
  }

  private get enabled(): boolean {
    return process.env.COWORK_AUDIT_ENABLED !== "false";
  }

  async log(
    kind: AuditEventKind,
    opts: {
      actor?: AuditEvent["actor"];
      toolName?: string;
      inputSummary?: string;
      outcome: AuditEvent["outcome"];
      reason?: string;
      durationMs?: number;
    }
  ): Promise<void> {
    if (!this.enabled) return;
    const event: AuditEvent = {
      id: randomUUID(),
      kind,
      sessionId: this.sessionId,
      projectRoot: this.projectRoot,
      timestamp: new Date().toISOString(),
      actor: opts.actor ?? "agent",
      toolName: opts.toolName,
      inputSummary: opts.inputSummary
        ? scrubSecrets(opts.inputSummary.slice(0, 500))
        : undefined,
      outcome: opts.outcome,
      reason: opts.reason,
      durationMs: opts.durationMs,
    };

    try {
      await appendFile(this.logPath, JSON.stringify(event) + "\n", "utf-8");
    } catch {
      // never throw on audit failure
    }
  }

  /** Convenience methods for common audit events */
  async toolCall(toolName: string, inputSummary: string, durationMs: number, isError: boolean): Promise<void> {
    await this.log("tool_call", {
      toolName,
      inputSummary,
      outcome: isError ? "error" : "success",
      durationMs,
    });
  }

  async toolDenied(toolName: string, reason: string): Promise<void> {
    await this.log("tool_denied", { toolName, outcome: "denied", reason });
  }

  async toolApproved(toolName: string): Promise<void> {
    await this.log("tool_approved", { toolName, actor: "user", outcome: "allowed" });
  }

  async bashCommand(command: string, outcome: AuditEvent["outcome"], durationMs: number): Promise<void> {
    await this.log("bash_command", {
      toolName: "Bash",
      inputSummary: command,
      outcome,
      durationMs,
    });
  }

  async sessionStart(): Promise<void> {
    await this.log("session_start", { actor: "system", outcome: "success" });
  }

  async sessionEnd(totalTurns: number, totalTokens: number): Promise<void> {
    await this.log("session_end", {
      actor: "system",
      outcome: "success",
      reason: `turns=${totalTurns} tokens=${totalTokens}`,
    });
  }
}
