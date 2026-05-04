// packages/core/src/mcp/McpToolAdapter.ts
// Wraps MCP tools as Locoworker ToolDefinitions so they participate in
// the standard agent loop (permission gate, approval, tool events, etc.)

import type { ToolDefinition, ExecutionContext } from "../Tool.js";
import { ok, err } from "../Tool.js";
import { PermissionLevel } from "../permissions/PermissionLevel.js";
import type { McpClient, McpToolSchema } from "./McpClient.js";
import type { McpServerConfig } from "./McpServerConfig.js";

function trustToLevel(trust: McpServerConfig["trustLevel"]): PermissionLevel {
  switch (trust) {
    case "read-only": return PermissionLevel.READ_ONLY;
    case "elevated":  return PermissionLevel.ELEVATED;
    default:          return PermissionLevel.STANDARD;
  }
}

export function mcpToolToDefinition(
  schema: McpToolSchema,
  client: McpClient,
  serverConfig: McpServerConfig,
): ToolDefinition {
  const level = trustToLevel(serverConfig.trustLevel);
  return {
    name: `mcp__${serverConfig.name}__${schema.name}`,
    description: `[MCP:${serverConfig.name}] ${schema.description ?? schema.name}`,
    inputSchema: schema.inputSchema,
    permissionLevel: level,
    requiresApproval: level >= PermissionLevel.ELEVATED,
    async execute(input: unknown, _ctx: ExecutionContext) {
      try {
        const result = await client.callTool(schema.name, input);
        if (result.isError) {
          const text = result.content.map((c) => c.text ?? "").join("\n");
          return err(`MCP tool error: ${text}`);
        }
        const text = result.content.map((c) => c.text ?? "").join("\n");
        return ok(text);
      } catch (e) {
        return err(`MCP call failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  };
}

export async function buildMcpTools(
  configs: McpServerConfig[],
): Promise<{ tools: ToolDefinition[]; clients: McpClient[] }> {
  const { McpClient } = await import("./McpClient.js");
  const tools: ToolDefinition[] = [];
  const clients: McpClient[] = [];

  for (const cfg of configs) {
    const client = new McpClient(cfg);
    try {
      await client.connect();
      const schemas = await client.listTools();
      for (const schema of schemas) {
        tools.push(mcpToolToDefinition(schema, client, cfg));
      }
      clients.push(client);
    } catch (e) {
      console.warn(`[mcp] Failed to connect to "${cfg.name}": ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { tools, clients };
}
