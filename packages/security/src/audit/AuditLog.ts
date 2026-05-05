import { join } from "node:path";
import { homedir } from "node:os";
import { mkdir, appendFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { scrubSecrets } from "../scrub/SecretScrubber.js";
import type { AuditEvent, AuditEventKind } from "./types.js";

export class AuditLog {
  private logPath: string;
  private sessionId: string;
  private projectRoot: string;

  constructor(opts: { sessionId: string; projectRoot: string }) {
    this.sessionId = opts.sessionId;
    this.projectRoot = opts.projectRoot;
    const today = new Date().toISOString().slice(0, 10);
    this.logPath = join(homedir(), ".cowork", "audit", `${today}.ndjson`);
  }

  async init(): Promise<void> {
    await mkdir(join(homedir(), ".cowork", "audit"), { recursive: true });
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
      toolName: "bash",
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
