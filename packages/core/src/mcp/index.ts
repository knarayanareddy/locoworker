// packages/core/src/mcp/index.ts

export { buildMcpTools } from "./buildMcpTools.js";
export type { McpBuildOptions } from "./buildMcpTools.js";
export { McpStdioClient } from "./McpStdioClient.js";
export type { McpClientLimits, McpSpawnPolicy, McpClientStats } from "./McpStdioClient.js";
export { buildMcpEnv } from "./mcpEnv.js";
export type { McpEnvResult } from "./mcpEnv.js";
export {
  makeMcpToolDefinition,
  sanitizeMcpDescription,
  validateMcpInputSchema,
  DEFAULT_MCP_METADATA_LIMITS,
  MCP_UNTRUSTED_OPEN,
  MCP_UNTRUSTED_CLOSE,
} from "./mcpToolMetadata.js";
export type { McpMetadataLimits } from "./mcpToolMetadata.js";
export type { McpServerConfig, McpToolSchema, McpClient } from "./types.js";
