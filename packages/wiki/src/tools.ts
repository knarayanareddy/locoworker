import type { ToolDefinition } from "@cowork/core";
import { PermissionLevel } from "@cowork/core";
import { LLMWiki } from "./LLMWiki";

export const WikiRead: ToolDefinition = {
  name: "WikiRead",
  description: "Read a wiki page by slug.",
  inputSchema: {
    type: "object",
    properties: { slug: { type: "string" } },
    required: ["slug"],
  },
  permissionLevel: PermissionLevel.READ_ONLY,
  async execute(input: { slug: string }, ctx) {
    const wiki = new LLMWiki({ projectRoot: ctx.workingDirectory });
    const page = await wiki.getPage(input.slug);
    if (!page) return { content: `No wiki page: ${input.slug}`, isError: true };
    return {
      content: `# ${page.title}\n\n${page.body}\n\n---\n*Last updated: ${page.updatedAt}*`,
      isError: false,
    };
  },
};

export const WikiSearch: ToolDefinition = {
  name: "WikiSearch",
  description: "Search the knowledge wiki for keywords.",
  inputSchema: {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
  },
  permissionLevel: PermissionLevel.READ_ONLY,
  async execute(input: { query: string }, ctx) {
    const wiki = new LLMWiki({ projectRoot: ctx.workingDirectory });
    const hits = await wiki.search(input.query);
    if (hits.length === 0) return { content: "No matches in wiki.", isError: false };
    return {
      content: hits
        .map((h) => `- ${h.slug.padEnd(20)} ${h.title}`)
        .join("\n"),
      isError: false,
    };
  },
};

export const WikiWrite: ToolDefinition = {
  name: "WikiWrite",
  description: "Create or update a wiki page.",
  inputSchema: {
    type: "object",
    properties: {
      slug: { type: "string" },
      title: { type: "string" },
      body: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
    },
    required: ["slug", "title", "body"],
  },
  permissionLevel: PermissionLevel.STANDARD,
  async execute(input: { slug: string; title: string; body: string; tags?: string[] }, ctx) {
    const wiki = new LLMWiki({ projectRoot: ctx.workingDirectory });
    const page = await wiki.upsertPage(input.slug, {
      title: input.title,
      body: input.body,
      tags: input.tags ?? [],
      sourceMemoryIds: [],
    });
    return {
      content: `Updated wiki page: ${page.slug} (v${page.version})`,
      isError: false,
    };
  },
};

export const WIKI_TOOLS = [WikiRead, WikiSearch, WikiWrite];
