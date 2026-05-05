// packages/core/src/mcp/buildMcpTools.ts

import { PermissionLevel } from "../permissions/index.js";
import type { ToolDefinition } from "../Tool.js";
import type { McpClient, McpServerConfig } from "./types.js";
import { McpStdioClient } from "./McpStdioClient.js";

export async function buildMcpTools(
  configs: McpServerConfig[]
): Promise<{ tools: ToolDefinition[]; clients: McpClient[] }> {
  const clients: McpClient[] = [];
  const tools: ToolDefinition[] = [];

  for (const config of configs) {
    try {
      let client: McpClient;

      if (config.transport === "stdio") {
        const c = new McpStdioClient(config);
        await c.connect();
        client = c;
      } else {
        // SSE transport: defer to a future McpSseClient implementation.
        // For now, log and skip rather than hard-failing the whole boot.
        console.warn(
          `[mcp] SSE transport not yet implemented for server "${config.name}" — skipping.`
        );
        continue;
      }

      clients.push(client);

      for (const mcpTool of client.tools) {
        // Prefix tool name with server name to avoid collisions
        const qualifiedName = `${config.name}__${mcpTool.name}`;

        const toolDef: ToolDefinition = {
          name: qualifiedName,
          description: `[MCP:${config.name}] ${mcpTool.description ?? mcpTool.name}`,
          permissionLevel: PermissionLevel.STANDARD,
          requiresApproval: false,
          inputSchema: {
            type: "object",
            ...(mcpTool.inputSchema as any),
          },
          async execute(input, _ctx) {
            return client.call(mcpTool.name, input);
          },
        };

        tools.push(toolDef);
      }
    } catch (err) {
      console.warn(
        `[mcp] Failed to connect to server "${config.name}": ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      // Don't abort the whole boot — just skip this MCP server.
    }
  }

  return { tools, clients };
}
