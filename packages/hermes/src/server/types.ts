import type { PermissionLevel, ResolvedSettings, AgentPolicy, ApprovalFn } from "@cowork/core";

export interface HermesConfig {
  transport: "stdio" | "sse";
  port?: number;
  /** Bearer token for the SSE transport. Required when binding non-loopback. */
  authToken?: string;
  /** Environment variable holding the token (default COWORK_HERMES_AUTH_TOKEN). */
  tokenEnvVar?: string;
  /** Bind host (default 127.0.0.1). */
  hostname?: string;
  toolAllowlist?: string[];
  serverName?: string;
  serverVersion?: string;
  /** Policy inherited by every tool executed through this MCP server. */
  policy?: AgentPolicy;
  permissionLevel?: PermissionLevel;
  requestApproval?: ApprovalFn;
  settings?: ResolvedSettings;
  workingDirectory?: string;
  abortSignal?: AbortSignal;
}

export interface McpJsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown;
}

export interface McpJsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}
