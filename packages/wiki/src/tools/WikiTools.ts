import { PermissionLevel, type ToolDefinition } from "@cowork/core";
import type { WikiStore } from "../store/WikiStore.js";
import type { WikiCompiler } from "../compiler/WikiCompiler.js";

export function makeWikiTools(
  store: WikiStore,
  compiler: WikiCompiler
): ToolDefinition[] {
  return [
    {
      name: "wiki_read",
      description: "Read a wiki page by title or slug. Returns the full article body.",
      permissionLevel: PermissionLevel.READ_ONLY,
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Page title, slug, or search query." },
        },
        required: ["query"],
      },
      async execute(input: { query: string }) {
        // Try exact slug first
        const bySlug = await store.getBySlug(
          input.query.toLowerCase().replace(/[^a-z0-9]+/g, "-")
        );
        if (bySlug) {
          await store.incrementReadCount(bySlug.id);
          return {
            content: `# ${bySlug.title}\n\n${bySlug.body || "(no compiled body yet — run wiki_compile first)"}`,
            isError: false,
          };
        }

        // Search
        const results = await store.search(input.query, 3);
        if (results.length === 0) {
          return { content: `No wiki pages found for "${input.query}".`, isError: false };
        }

        const lines = results.map(
          (r) => `## ${r.page.title}\n${r.page.body.slice(0, 400)}...`
        );
        return { content: lines.join("\n\n"), isError: false };
      },
    },

    {
      name: "wiki_write",
      description: "Add a source to a wiki page (creating it if it doesn't exist). Sources are raw facts/docs that will be compiled into an article.",
      permissionLevel: PermissionLevel.CONSTRAINED,
      inputSchema: {
        type: "object",
        properties: {
          title:  { type: "string", description: "Wiki page title." },
          source: { type: "string", description: "Raw source material to add to the page." },
          tags:   { type: "array", items: { type: "string" }, description: "Optional tags." },
        },
        required: ["title", "source"],
      },
      async execute(input: { title: string; source: string; tags?: string[] }) {
        const slug = input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        let page = await store.getBySlug(slug);
        if (!page) {
          page = await store.create({
            title: input.title,
            sources: [input.source],
            tags: input.tags ?? [],
          });
          return {
            content: `Created wiki page "${input.title}" (id: ${page.id}). Run wiki_compile to generate the article.`,
            isError: false,
          };
        }

        const updated = await store.update(page.id, {
          sources: [...page.sources, input.source],
          tags: input.tags ? [...new Set([...page.tags, ...input.tags])] : page.tags,
        });
        return {
          content: `Added source to wiki page "${input.title}" (${updated?.sources.length ?? 0} sources total). Run wiki_compile to regenerate.`,
          isError: false,
        };
      },
    },

    {
      name: "wiki_compile",
      description: "Compile a wiki page from its raw sources into a structured article using the AI model.",
      permissionLevel: PermissionLevel.STANDARD,
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Title of the page to compile. Omit to compile all pages." },
        },
        required: [],
      },
      async execute(input: { title?: string }) {
        if (input.title) {
          const slug = input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
          const page = await store.getBySlug(slug);
          if (!page) {
            return { content: `Wiki page "${input.title}" not found.`, isError: true };
          }
          const compiled = await compiler.compilePage(page.id);
          if (!compiled) return { content: "Compilation failed.", isError: true };
          return {
            content: `Compiled "${compiled.title}" (confidence: ${compiled.confidence.toFixed(2)}):\n\n${compiled.body.slice(0, 800)}`,
            isError: false,
          };
        }

        const count = await compiler.compileAll();
        return { content: `Compiled ${count} wiki pages.`, isError: false };
      },
    },

    {
      name: "wiki_list",
      description: "List all wiki pages with titles and tags.",
      permissionLevel: PermissionLevel.READ_ONLY,
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
      async execute() {
        const pages = await store.list();
        if (pages.length === 0) {
          return { content: "No wiki pages yet. Use wiki_write to create pages.", isError: false };
        }
        const lines = pages.map(
          (p) => `• ${p.title} [${p.tags.join(", ") || "untagged"}] — ${p.body ? "compiled" : "pending compile"}`
        );
        return { content: `Wiki pages (${pages.length}):\n${lines.join("\n")}`, isError: false };
      },
    },

    {
      name: "wiki_search",
      description: "Search wiki pages by keyword.",
      permissionLevel: PermissionLevel.READ_ONLY,
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query." },
        },
        required: ["query"],
      },
      async execute(input: { query: string }) {
        const results = await store.search(input.query, 5);
        if (results.length === 0) {
          return { content: `No wiki pages match "${input.query}".`, isError: false };
        }
        const lines = results.map(
          (r) => `• ${r.page.title} (score: ${r.score}, via: ${r.via})\n  ${r.page.body.slice(0, 200)}`
        );
        return { content: lines.join("\n\n"), isError: false };
      },
    },
  ];
}
