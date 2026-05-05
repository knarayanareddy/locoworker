// packages/core/src/mcp/types.ts

export interface McpServerConfig {
  /** A human-readable name for this MCP server (used in tool name prefixing). */
  name: string;
  /** Transport: "stdio" spawns a process; "sse" connects to an HTTP SSE endpoint. */
  transport: "stdio" | "sse";
  /** For transport=stdio: the command to spawn. */
  command?: string;
  /** For transport=stdio: arguments to the command. */
  args?: string[];
  /** For transport=sse: the base URL of the SSE endpoint. */
  url?: string;
  /** Optional auth token sent as Bearer in the Authorization header (sse only). */
  authToken?: string;
  /** Optional env overrides for the spawned process (stdio only). */
  env?: Record<string, string>;
}

export interface McpToolSchema {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpClient {
  serverName: string;
  tools: McpToolSchema[];
  call(toolName: string, input: unknown): Promise<{ content: string; isError: boolean }>;
  disconnect(): Promise<void>;
}
