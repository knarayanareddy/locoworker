import type { HookRegistry } from "../hooks/HookRegistry.js";
import type { ResolvedSettings } from "../state/Settings.js";
import type { PermissionLevel } from "../permissions/PermissionLevel.js";

export type ApprovalFn = (toolName: string, input: Record<string, unknown>) => Promise<boolean>;

/**
 * A policy is the security context that follows an agent into every nested
 * loop (orchestrator workers, council members, research/simulation agents,
 * MCP/gateway tool calls). Without it, nested loops silently reset to
 * STANDARD permissions and auto-approve everything.
 */
export interface AgentPolicy {
  permissionLevel?: PermissionLevel;
  requestApproval?: ApprovalFn;
  settings?: ResolvedSettings;
  workingDirectory?: string;
  sessionId?: string;
  abortSignal?: AbortSignal;
  hooks?: HookRegistry;
  maxTurns?: number;
  maxTokens?: number;
}

/** Fill only keys the caller left undefined; never override explicit config. */
export function applyAgentPolicy<T extends object>(config: T, policy: AgentPolicy | undefined): T {
  if (!policy) return config;
  const merged: Record<string, unknown> = { ...(config as unknown as Record<string, unknown>) };
  for (const [key, value] of Object.entries(policy)) {
    if (value !== undefined && merged[key] === undefined) merged[key] = value;
  }
  return merged as unknown as T;
}

/**
 * Process-wide fallback for nested loops that don't thread a policy through
 * their own config. `buildSessionRuntime` sets this to a *deny-approval*
 * policy, so an unmodified nested loop cannot escalate permissions.
 */
let ambientPolicy: AgentPolicy | undefined;

export function setDefaultAgentPolicy(policy: AgentPolicy | undefined): void {
  ambientPolicy = policy;
}

export function getDefaultAgentPolicy(): AgentPolicy | undefined {
  return ambientPolicy;
}

/** Clamp a derived policy so it can never be more permissive than its parent. */
export function deriveNestedPolicy(
  base: AgentPolicy | undefined,
  overrides: AgentPolicy = {},
): AgentPolicy {
  const combined: AgentPolicy = { ...base, ...overrides };
  if (base?.permissionLevel !== undefined && overrides.permissionLevel !== undefined) {
    combined.permissionLevel = Math.min(base.permissionLevel, overrides.permissionLevel) as PermissionLevel;
  }
  return combined;
}
