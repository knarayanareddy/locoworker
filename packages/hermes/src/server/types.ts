export interface HermesConfig {
  transport: "stdio" | "sse";
  port?: number;
  authToken?: string;
  toolAllowlist?: string[];
  serverName?: string;
  serverVersion?: string;
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
