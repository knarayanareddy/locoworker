/**
 * Phase 4 session extensions.
 * Wires MiroFish, OpenClaw gateway, Hermes, telemetry,
 * analytics, security/audit, cache-aware prompts, council, SOUL.md.
 */

import type { SessionRuntime } from "@cowork/core";
import { TelemetryService } from "@cowork/telemetry";
import { CostTracker } from "@cowork/analytics";
import { AuditLog } from "@cowork/security";
import { SandboxPolicy } from "@cowork/security";
import { CacheAwareSystemPrompt } from "@cowork/cache";
import { loadSoulContext } from "@cowork/core";
import { MIROFISH_TOOLS } from "@cowork/mirofish";
import { ANALYTICS_TOOLS } from "@cowork/analytics";
import { SECURITY_TOOLS } from "@cowork/security";
import { COUNCIL_TOOLS } from "@cowork/core";
import { randomUUID } from "node:crypto";
import path from "path";

export interface Phase4Runtime {
  telemetry: TelemetryService;
  costTracker: CostTracker;
  auditLog: AuditLog;
  sandboxPolicy: SandboxPolicy;
  sessionId: string;
  cachePrompt?: CacheAwareSystemPrompt;
}

export async function bootstrapPhase4(
  runtime: SessionRuntime,
  options: {
    enableTelemetry?: boolean;
    enableCostTracking?: boolean;
    enableAudit?: boolean;
    enableCachePrompts?: boolean;
    enableSoul?: boolean;
    enableMirofish?: boolean;
    enableCouncil?: boolean;
    exportOtlpUrl?: string;
  } = {}
): Promise<Phase4Runtime> {
  const sessionId = randomUUID();

  // ── 1. Telemetry ──────────────────────────────────────────────────────────
  const telemetry = new TelemetryService({
    projectRoot: runtime.projectRoot,
    enabled: options.enableTelemetry !== false,
    exportOtlpUrl: options.exportOtlpUrl,
  });
  telemetry.metrics.counter("session.start", { provider: runtime.settings.provider });

  // ── 2. Cost tracking ───────────────────────────────────────────────────────
  const costTracker = new CostTracker(runtime.projectRoot, sessionId);

  // ── 3. Audit log ───────────────────────────────────────────────────────────
  const auditLog = new AuditLog(runtime.projectRoot, sessionId);
  if (options.enableAudit !== false) {
    await auditLog.log("session_start", { actor: "system", risk: "low" });
  }

  // ── 4. Sandbox policy (enhanced bash security) ─────────────────────────────
  const sandboxPolicy = new SandboxPolicy({
    projectRoot: runtime.projectRoot,
    permissionLevel: runtime.settings.permissionMode ?? "STANDARD",
    allowNetworkAccess: runtime.settings.permissionMode === "ELEVATED" ||
                        runtime.settings.permissionMode === "FULL",
  });

  // ── 5. SOUL.md context ─────────────────────────────────────────────────────
  if (options.enableSoul !== false) {
    const soul = await loadSoulContext(runtime.projectRoot);
    if (soul.loaded && soul.content) {
      runtime.systemPrompt = soul.content + "\n\n---\n\n" + runtime.systemPrompt;
    }
  }

  // ── 6. Cache-aware system prompt ───────────────────────────────────────────
  let cachePrompt: CacheAwareSystemPrompt | undefined;
  if (options.enableCachePrompts !== false) {
    cachePrompt = new CacheAwareSystemPrompt({
      baseSystemPrompt: runtime.systemPrompt,
      claudeMdPath: path.join(runtime.projectRoot, "CLAUDE.md"),
    });
    const built = await cachePrompt.build();
    runtime.systemPrompt = built.combined;
    telemetry.metrics.gauge("cache.estimatedCacheableTokens", built.estimatedCacheableTokens);
  }

  // ── 7. MiroFish tools ──────────────────────────────────────────────────────
  if (options.enableMirofish !== false) {
    for (const tool of MIROFISH_TOOLS) {
      runtime.tools.push(tool);
    }
  }

  // ── 8. Analytics + Security tools ─────────────────────────────────────────
  for (const tool of [...ANALYTICS_TOOLS, ...SECURITY_TOOLS]) {
    runtime.tools.push(tool);
  }

  // ── 9. Council tools ───────────────────────────────────────────────────────
  if (options.enableCouncil !== false) {
    for (const tool of COUNCIL_TOOLS) {
      runtime.tools.push(tool);
    }
  }

  // ── 10. Session end cleanup ────────────────────────────────────────────────
  process.on("exit", () => {
    telemetry.stop();
    if (options.enableAudit !== false) {
      void auditLog.log("session_end", { actor: "system", risk: "low" });
    }
  });

  return { telemetry, costTracker, auditLog, sandboxPolicy, sessionId, cachePrompt };
}
