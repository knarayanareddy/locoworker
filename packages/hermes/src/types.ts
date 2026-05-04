export interface HermesConfig {
  projectRoot: string;
  transport: "stdio" | "sse";
  port?: number;
  tools?: string[]; // list of tool names to expose
  authToken?: string;
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
