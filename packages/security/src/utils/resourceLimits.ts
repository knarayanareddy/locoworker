/**
 * Trusted, operator-level resource limits (R-11).
 *
 * Every cap in this file is read from the **process environment** (or passed
 * explicitly by a trusted caller in tests). Nothing here may come from a
 * project-local `settings.json`: that file is untrusted, so letting it raise a
 * limit would let an attacker raise the very bound we just added.
 *
 * All values are clamped to a safe range, so a typo (`COWORK_MAX_SESSIONS=0`)
 * cannot disable a bound or allocate an absurd amount of memory.
 */

export interface ResourceLimits {
  /** Max distinct gateway chat sessions kept in memory. */
  maxSessions: number;
  /** Absolute TTL of a gateway chat session (ms). */
  sessionTtlMs: number;
  /** Max distinct principals with a retained outbox. */
  maxOutboxPrincipals: number;
  /** Absolute TTL of an outbox (ms). */
  outboxTtlMs: number;
  /** Approximate byte budget for each in-memory state map. */
  maxStateBytes: number;
  /** Max concurrent Hermes SSE connections. */
  maxSseConnections: number;
  /** Max lifetime of one SSE connection (ms); heartbeat does not extend it. */
  sseIdleMs: number;
  /** SSE heartbeat interval (ms). */
  sseHeartbeatMs: number;
  /** Max HTTP request body bytes, enforced before JSON parsing. */
  maxRequestBytes: number;
  /** Max buffered MCP stdio line bytes (no newline allowed to grow past this). */
  maxMcpLineBytes: number;
  /** Max in-flight MCP requests / queued stdio lines. */
  maxMcpPending: number;
  /** Per-request MCP timeout (ms). */
  mcpRequestTimeoutMs: number;
  /** Global byte budget for one audit-log tail scan. */
  maxAuditScanBytes: number;
  /** Max number of audit NDJSON files scanned per call. */
  maxAuditFiles: number;
  /** Hard cap on rows returned by `AuditLog.read(0)`. */
  maxAuditRows: number;
  /** Max length of a single audit NDJSON line. */
  maxAuditLineBytes: number;
  /** Hard cap on rows in a dashboard log export. */
  maxAuditExportRows: number;
  /** Hard cap on the serialised dashboard log export body. */
  maxAuditExportBytes: number;
  /** R-13: max tools exposed per MCP server / in total. */
  mcpMaxToolsPerServer: number;
  mcpMaxToolsTotal: number;
  /** R-13: max characters of an MCP tool description injected into a prompt. */
  mcpMaxDescriptionChars: number;
  /** R-13: template scaffold file/size ceilings. */
  maxTemplateFiles: number;
  maxTemplateFileBytes: number;
  maxTemplateTotalBytes: number;
  /** R-13: per-command timeout for opted-in template postInstall steps. */
  templatePostInstallTimeoutMs: number;
}

type LimitKey = keyof ResourceLimits;

/** Environment variable that backs each limit. */
export const LIMIT_ENV_NAMES: Readonly<Record<LimitKey, string>> = Object.freeze({
  maxSessions: "COWORK_MAX_SESSIONS",
  sessionTtlMs: "COWORK_SESSION_TTL_MS",
  maxOutboxPrincipals: "COWORK_MAX_OUTBOX_PRINCIPALS",
  outboxTtlMs: "COWORK_OUTBOX_TTL_MS",
  maxStateBytes: "COWORK_MAX_STATE_BYTES",
  maxSseConnections: "COWORK_MAX_SSE_CONNECTIONS",
  sseIdleMs: "COWORK_SSE_IDLE_MS",
  sseHeartbeatMs: "COWORK_SSE_HEARTBEAT_MS",
  maxRequestBytes: "COWORK_MAX_REQUEST_BYTES",
  maxMcpLineBytes: "COWORK_MAX_MCP_LINE_BYTES",
  maxMcpPending: "COWORK_MAX_MCP_PENDING",
  mcpRequestTimeoutMs: "COWORK_MCP_REQUEST_TIMEOUT_MS",
  maxAuditScanBytes: "COWORK_MAX_AUDIT_SCAN_BYTES",
  maxAuditFiles: "COWORK_MAX_AUDIT_FILES",
  maxAuditRows: "COWORK_MAX_AUDIT_ROWS",
  maxAuditLineBytes: "COWORK_MAX_AUDIT_LINE_BYTES",
  maxAuditExportRows: "COWORK_MAX_AUDIT_EXPORT_ROWS",
  maxAuditExportBytes: "COWORK_MAX_AUDIT_EXPORT_BYTES",
  mcpMaxToolsPerServer: "COWORK_MCP_MAX_TOOLS_PER_SERVER",
  mcpMaxToolsTotal: "COWORK_MCP_MAX_TOOLS_TOTAL",
  mcpMaxDescriptionChars: "COWORK_MCP_MAX_DESCRIPTION_CHARS",
  maxTemplateFiles: "COWORK_TEMPLATE_MAX_FILES",
  maxTemplateFileBytes: "COWORK_TEMPLATE_MAX_FILE_BYTES",
  maxTemplateTotalBytes: "COWORK_TEMPLATE_MAX_TOTAL_BYTES",
  templatePostInstallTimeoutMs: "COWORK_TEMPLATE_POSTINSTALL_TIMEOUT_MS",
});

/** Inclusive [min, max] for every limit. */
const RANGES: Readonly<Record<LimitKey, readonly [number, number]>> = Object.freeze({
  maxSessions: [1, 100_000],
  sessionTtlMs: [1_000, 86_400_000],
  maxOutboxPrincipals: [1, 100_000],
  outboxTtlMs: [1_000, 86_400_000],
  maxStateBytes: [1_024, 64 * 1024 * 1024],
  maxSseConnections: [1, 1_024],
  sseIdleMs: [50, 3_600_000],
  sseHeartbeatMs: [10, 60_000],
  maxRequestBytes: [128, 8 * 1024 * 1024],
  maxMcpLineBytes: [128, 8 * 1024 * 1024],
  maxMcpPending: [1, 10_000],
  mcpRequestTimeoutMs: [10, 600_000],
  maxAuditScanBytes: [1_024, 64 * 1024 * 1024],
  maxAuditFiles: [1, 365],
  maxAuditRows: [1, 100_000],
  maxAuditLineBytes: [256, 1024 * 1024],
  maxAuditExportRows: [1, 100_000],
  maxAuditExportBytes: [1_024, 64 * 1024 * 1024],
  mcpMaxToolsPerServer: [1, 1_000],
  mcpMaxToolsTotal: [1, 5_000],
  mcpMaxDescriptionChars: [64, 32_000],
  maxTemplateFiles: [1, 10_000],
  maxTemplateFileBytes: [1, 8 * 1024 * 1024],
  maxTemplateTotalBytes: [1, 64 * 1024 * 1024],
  templatePostInstallTimeoutMs: [100, 600_000],
});

export const DEFAULT_RESOURCE_LIMITS: Readonly<ResourceLimits> = Object.freeze({
  maxSessions: 1_000,
  sessionTtlMs: 30 * 60_000,
  maxOutboxPrincipals: 1_000,
  outboxTtlMs: 30 * 60_000,
  maxStateBytes: 8 * 1024 * 1024,
  maxSseConnections: 32,
  sseIdleMs: 5 * 60_000,
  sseHeartbeatMs: 15_000,
  maxRequestBytes: 1024 * 1024,
  maxMcpLineBytes: 1024 * 1024,
  maxMcpPending: 64,
  mcpRequestTimeoutMs: 30_000,
  maxAuditScanBytes: 8 * 1024 * 1024,
  maxAuditFiles: 30,
  maxAuditRows: 10_000,
  maxAuditLineBytes: 256 * 1024,
  maxAuditExportRows: 5_000,
  maxAuditExportBytes: 8 * 1024 * 1024,
  mcpMaxToolsPerServer: 64,
  mcpMaxToolsTotal: 256,
  mcpMaxDescriptionChars: 2_000,
  maxTemplateFiles: 500,
  maxTemplateFileBytes: 512 * 1024,
  maxTemplateTotalBytes: 8 * 1024 * 1024,
  templatePostInstallTimeoutMs: 60_000,
});

/**
 * Return `value` truncated to an integer when it lies inside [min, max],
 * otherwise the safe `fallback`. An operator typo (`0`, `99999999`, `abc`)
 * must never silently turn into a useless or dangerously large bound.
 */
export function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  const n = Math.trunc(value);
  if (n < min || n > max) return fallback;
  return n;
}

export function readBoundedIntEnv(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  return clampInt(Number(raw), min, max, fallback);
}

/** Resolve every limit from a trusted environment. */
export function resolveResourceLimits(env: NodeJS.ProcessEnv = process.env): ResourceLimits {
  const out = { ...DEFAULT_RESOURCE_LIMITS } as ResourceLimits;
  for (const key of Object.keys(RANGES) as LimitKey[]) {
    const [min, max] = RANGES[key];
    const fallback = DEFAULT_RESOURCE_LIMITS[key];
    out[key] = readBoundedIntEnv(env, LIMIT_ENV_NAMES[key], fallback, min, max);
  }
  return out;
}

/**
 * Resolve limits and apply trusted overrides (used by tests and by callers
 * with a hard-coded policy). Overrides are clamped to the same safe range.
 */
export function mergeResourceLimits(
  overrides?: Partial<ResourceLimits>,
  env: NodeJS.ProcessEnv = process.env,
): ResourceLimits {
  const out = resolveResourceLimits(env);
  if (!overrides) return out;
  for (const [rawKey, rawValue] of Object.entries(overrides) as [LimitKey, number | undefined][]) {
    if (rawValue === undefined) continue;
    const range = RANGES[rawKey];
    if (!range) continue;
    out[rawKey] = clampInt(rawValue, range[0], range[1], DEFAULT_RESOURCE_LIMITS[rawKey]);
  }
  return out;
}

/**
 * Rate-limited stderr logger for map evictions. Pressure is visible to an
 * operator without producing one log line per evicted entry.
 */
export function createEvictionLogger(
  label: string,
  minIntervalMs = 5_000,
): (reason: string) => void {
  let lastLog = 0;
  let pending = 0;
  return (reason: string) => {
    pending += 1;
    const now = Date.now();
    if (now - lastLog < minIntervalMs) return;
    if (pending === 0) return;
    process.stderr.write(
      `[limits] ${label}: ${pending} eviction(s), last reason=${reason}\n`,
    );
    lastLog = now;
    pending = 0;
  };
}
