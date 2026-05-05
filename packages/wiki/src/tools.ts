import { PermissionLevel, type ToolDefinition, type ToolContext } from "@cowork/core";
import { LLMWiki } from "./LLMWiki";

// ── WikiRead ──────────────────────────────────────────────────────────────────
export const WikiRead: ToolDefinition = {
  name: "WikiRead",
  description:
    "Read a wiki page by slug, or list all pages if no slug provided. " +
    "The wiki is a curated knowledge base built from project memory entries.",
  inputSchema: {
    type: "object",
    properties: {
      slug: {
        type: "string",
        description: "Page slug (url-safe id). Omit to list all pages.",
      },
    },
    required: [],
  },
  permissionLevel: PermissionLevel.READ_ONLY,
  async execute(input: { slug?: string }, ctx: ToolContext) {
    const wiki = new LLMWiki({ projectRoot: ctx.workingDirectory });
    if (input.slug) {
      const page = await wiki.getPage(input.slug);
      if (!page) {
        return { content: `No wiki page found with slug "${input.slug}"`, isError: false };
      }
      return {
        content: `# ${page.title} (v${page.version})\nTags: ${page.tags.join(", ")}\nUpdated: ${page.updatedAt}\n\n${page.body}`,
        isError: false,
      };
    }
    const pages = await wiki.listPages();
    if (pages.length === 0) {
      return { content: "Wiki is empty. Use WikiWrite to create pages.", isError: false };
    }
    const lines = pages.map(
      (p) => `- **${p.title}** (\`${p.slug}\`) — v${p.version} — ${p.tags.join(", ")}`
    );
    return { content: `## Wiki Pages (${pages.length})\n\n${lines.join("\n")}`, isError: false };
  },
};

// ── WikiSearch ────────────────────────────────────────────────────────────────
export const WikiSearch: ToolDefinition = {
  name: "WikiSearch",
  description: "Full-text search across all wiki pages (title, body, tags).",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
    },
    required: ["query"],
  },
  permissionLevel: PermissionLevel.READ_ONLY,
  async execute(input: { query: string }, ctx: ToolContext) {
    const wiki = new LLMWiki({ projectRoot: ctx.workingDirectory });
    const results = await wiki.search(input.query);
    if (results.length === 0) {
      return { content: `No wiki pages match "${input.query}"`, isError: false };
    }
    const lines = results.map(
      (p) => `### ${p.title} (\`${p.slug}\`)\n${p.body.slice(0, 300)}…`
    );
    return { content: lines.join("\n\n---\n\n"), isError: false };
  },
};

// ── WikiWrite ─────────────────────────────────────────────────────────────────
export const WikiWrite: ToolDefinition = {
  name: "WikiWrite",
  description:
    "Create or update a wiki page. Use this to document important project knowledge " +
    "that should persist across sessions.",
  inputSchema: {
    type: "object",
    properties: {
      slug: { type: "string", description: "url-safe identifier e.g. 'query-engine'" },
      title: { type: "string" },
      body: { type: "string", description: "Markdown body content" },
      tags: { type: "array", items: { type: "string" } },
    },
    required: ["slug", "title", "body"],
  },
  permissionLevel: PermissionLevel.CONSTRAINED,
  async execute(
    input: { slug: string; title: string; body: string; tags?: string[] },
    ctx: ToolContext
  ) {
    const wiki = new LLMWiki({ projectRoot: ctx.workingDirectory });
    const page = await wiki.upsertPage(input.slug, {
      title: input.title,
      body: input.body,
      tags: input.tags ?? [],
      sourceMemoryIds: [],
    });
    return {
      content: `Wiki page "${page.title}" saved (v${page.version})`,
      isError: false,
    };
  },
};

export const WIKI_TOOLS: ToolDefinition[] = [WikiRead, WikiSearch, WikiWrite];
