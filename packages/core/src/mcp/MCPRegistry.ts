import { MCPClient } from "./MCPClient.js";
import type { ToolDefinition } from "../Tool.js";

export interface MCPServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  transport: "stdio";
}

export class MCPRegistry {
  private clients = new Map<string, MCPClient>();

  async register(config: MCPServerConfig): Promise<void> {
    if (this.clients.has(config.name)) return;

    const client = new MCPClient(
      config.name,
      config.command,
      config.args ?? [],
      config.env ?? {}
    );
    await client.connect();
    this.clients.set(config.name, client);
  }

  async getAllTools(): Promise<ToolDefinition[]> {
    const allTools: ToolDefinition[] = [];
    for (const client of this.clients.values()) {
      try {
        const tools = await client.listTools();
        allTools.push(...tools);
      } catch (err) {
        console.warn(`[MCP] Failed to list tools for client:`, err);
      }
    }
    return allTools;
  }

  async shutdown(): Promise<void> {
    for (const client of this.clients.values()) {
      await client.close();
    }
    this.clients.clear();
  }
}
