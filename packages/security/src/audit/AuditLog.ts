import { join } from "node:path";
import { readdir } from "node:fs/promises";
import { ensurePrivateDir, appendPrivateFile } from "./secureFile.js";
import { randomUUID } from "node:crypto";
import { scrubSecrets } from "../scrub/SecretScrubber.js";
import { getCoworkHome } from "./coworkHome.js";
import { scanNdjsonTail } from "../utils/tailFile.js";
import { mergeResourceLimits, type ResourceLimits } from "../utils/resourceLimits.js";
import type { AuditEvent, AuditEventKind } from "./types.js";
import Ajv, { type ValidateFunction } from "ajv";

export type AuditLogOptions = {
  sessionId: string;
  projectRoot: string;
  /** Trusted overrides (tests / explicit operator policy). Never project settings. */
  limits?: Partial<ResourceLimits>;
};

/**
 * Two-layer validation for lines read back from disk (R-15 + R-11):
 *  1. a cheap structural check (plain object, no prototype-polluting keys,
 *     bounded line length) before any schema work;
 *  2. Ajv against a strict AuditEvent schema, so a corrupt or hostile log line
 *     cannot inject arbitrary fields into dashboard responses.
 */
const AUDIT_KINDS: readonly AuditEventKind[] = [
  "tool_call", "tool_denied", "tool_approved", "session_start", "session_end",
  "permission_escalation", "bash_command", "file_write", "file_delete",
  "mcp_call", "skill_execute",
];

const AUDIT_EVENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["id", "kind", "sessionId", "projectRoot", "timestamp", "actor", "outcome"],
  properties: {
    id: { type: "string", maxLength: 128 },
    kind: { type: "string", enum: [...AUDIT_KINDS] },
    sessionId: { type: "string", maxLength: 256 },
    projectRoot: { type: "string", maxLength: 4096 },
    timestamp: { type: "string", maxLength: 64 },
    actor: { type: "string", enum: ["agent", "user", "system"] },
    toolName: { type: "string", maxLength: 256 },
    inputSummary: { type: "string", maxLength: 2048 },
    outcome: { type: "string", enum: ["allowed", "denied", "error", "success"] },
    reason: { type: "string", maxLength: 2048 },
    durationMs: { type: "number" },
  },
} as const;

const ajv = new Ajv({ allErrors: false, strict: false, validateFormats: false });
const validateAuditEvent: ValidateFunction = ajv.compile(AUDIT_EVENT_SCHEMA);

const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function parseAuditEvent(line: string, maxLineBytes: number): AuditEvent | null {
  if (line.length === 0 || line.length > maxLineBytes) return null;
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(key)) return null;
  }
  if (!validateAuditEvent(value)) return null;
  return value as AuditEvent;
}

export interface AuditScanStats {
  rows: number;
  bytesRead: number;
  truncated: boolean;
}

export class AuditLog {
  private logPath: string;
  private sessionId: string;
  private projectRoot: string;
  private readonly limits: ResourceLimits;
  private scanStats: AuditScanStats = { rows: 0, bytesRead: 0, truncated: false };

  constructor(opts: AuditLogOptions) {
    this.sessionId = opts.sessionId;
    this.projectRoot = opts.projectRoot;
    this.limits = mergeResourceLimits(opts.limits);
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

  /** Stats for the last tail scan — lets tests assert the byte budget held. */
  get lastScan(): AuditScanStats {
    return { ...this.scanStats };
  }

  async init(): Promise<void> {
    await ensurePrivateDir(this.auditDir);
  }

  /**
   * Read audit events, newest last. `limit` counts entries, not files.
   * `limit = 0` means "all", but is still hard-capped by `maxAuditRows`,
   * `maxAuditScanBytes` and `maxAuditFiles` — it no longer reads the whole
   * history into memory (R-11).
   */
  async read(limit = 200): Promise<AuditEvent[]> {
    const effective = limit > 0
      ? Math.min(limit, this.limits.maxAuditRows)
      : this.limits.maxAuditRows;
    return this.readTail(effective);
  }

  /** Bounded reverse-tail read: newest-last result, at most `limit` rows. */
  async readTail(limit: number): Promise<AuditEvent[]> {
    const rows: AuditEvent[] = [];
    await this.scanTail(limit, (event) => rows.push(event));
    rows.reverse(); // scanTail visits newest-first; callers expect newest-last
    return rows;
  }

  /** Cheap bounded count for dashboard stats — never materialises the events. */
  async countRecent(limit = 1_000): Promise<number> {
    const effective = limit > 0
      ? Math.min(limit, this.limits.maxAuditRows)
      : this.limits.maxAuditRows;
    const result = await this.scanTail(effective, () => {});
    return result.count;
  }

  private async scanTail(limit: number, visit: (event: AuditEvent) => void) {
    let files: string[];
    try {
      files = (await readdir(this.auditDir))
        .filter((f) => f.endsWith(".ndjson"))
        .sort()
        .reverse()
        .slice(0, this.limits.maxAuditFiles);
    } catch {
      this.scanStats = { rows: 0, bytesRead: 0, truncated: false };
      return { count: 0, bytesRead: 0, truncated: false };
    }

    const result = await scanNdjsonTail<AuditEvent>(
      files.map((f) => join(this.auditDir, f)),
      {
        limit,
        maxScanBytes: this.limits.maxAuditScanBytes,
        maxLineBytes: this.limits.maxAuditLineBytes,
        parse: (line) => parseAuditEvent(line, this.limits.maxAuditLineBytes),
        visit,
      },
    );
    this.scanStats = {
      rows: result.count,
      bytesRead: result.bytesRead,
      truncated: result.truncated,
    };
    return result;
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
      // Scrub the full value BEFORE truncation: slicing a multi-line PEM
      // key first can leave an unscrubbable secret fragment in the log.
      inputSummary: opts.inputSummary
        ? scrubSecrets(opts.inputSummary).slice(0, 500)
        : undefined,
      outcome: opts.outcome,
      reason: opts.reason ? scrubSecrets(opts.reason).slice(0, 500) : undefined,
      durationMs: opts.durationMs,
    };

    try {
      await appendPrivateFile(this.logPath, JSON.stringify(event) + "\n");
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
