import type { ToolDefinition, ToolContext } from "@cowork/core";
import { MarketplaceClient } from "./MarketplaceClient";

export const MarketplaceSearch: ToolDefinition = {
  name: "MarketplaceSearch",
  description:
    "Search the cowork plugin marketplace for community plugins. " +
    "Find plugins by name, tag, or keyword.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
      tags: { type: "array", items: { type: "string" } },
      limit: { type: "number", description: "Max results (default 10)" },
    },
    required: [],
  },
  permissionLevel: "READ_ONLY",
  async execute(input: { query?: string; tags?: string[]; limit?: number }, ctx: ToolContext) {
    const client = new MarketplaceClient(ctx.workingDirectory);
    const plugins = await client.list({
      query: input.query,
      tags: input.tags,
      limit: input.limit ?? 10,
    });
    if (plugins.length === 0) {
      return { content: "No plugins found in marketplace.", isError: false };
    }
    const lines = plugins.map(
      (p) => `- **${p.name}** (\`${p.id}\`) v${p.version} — ${p.description}\n  Tags: ${p.tags.join(", ")}`
    );
    return { content: `## Marketplace (${plugins.length} results)\n\n${lines.join("\n\n")}`, isError: false };
  },
};

export const MarketplaceInstall: ToolDefinition = {
  name: "MarketplaceInstall",
  description: "Install a plugin from the marketplace by its ID.",
  inputSchema: {
    type: "object",
    properties: {
      pluginId: { type: "string", description: "Plugin ID from marketplace" },
    },
    required: ["pluginId"],
  },
  permissionLevel: "ELEVATED",
  requiresApproval: true,
  async execute(input: { pluginId: string }, ctx: ToolContext) {
    const client = new MarketplaceClient(ctx.workingDirectory);
    const result = await client.install(input.pluginId);
    if (!result.success) {
      return { content: `Install failed: ${result.error}`, isError: true };
    }
    return {
      content: `Plugin "${input.pluginId}" v${result.version} installed successfully.`,
      isError: false,
    };
  },
};

export const MARKETPLACE_TOOLS: ToolDefinition[] = [MarketplaceSearch, MarketplaceInstall];
