// packages/core/src/mcp/McpServerConfig.ts
// Configuration shape for an MCP server connection.

export type McpTransport = "stdio" | "http";

export interface McpServerConfig {
  /** Unique name for this MCP server */
  name: string;
  /** Transport type */
  transport: McpTransport;
  /** For stdio: command to spawn */
  command?: string;
  /** For stdio: args */
  args?: string[];
  /** For http: base URL */
  url?: string;
  /** Optional: HTTP bearer token */
  apiKey?: string;
  /** Optional: trust level (default: "standard") */
  trustLevel?: "read-only" | "standard" | "elevated";
  /** Optional: env vars to inject for stdio */
  env?: Record<string, string>;
}
