export interface HermesConfig {
  projectRoot: string;
  tools?: string[];          // tool names to expose (all if omitted)
  transport: "stdio" | "sse";
  port?: number;             // for SSE transport (default 3722)
  authToken?: string;        // optional Bearer token for SSE
  verbose?: boolean;
}

export interface MCPRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown;
}

export interface MCPResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface MCPToolSchema {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
