import type { WikiPage, WikiIndex, LLMWikiConfig } from "./types";
import { MemorySystem } from "@cowork/core";
import path from "path";
import { mkdir } from "node:fs/promises";
import { Glob } from "bun";

export class LLMWiki {
  private config: Required<LLMWikiConfig>;

  constructor(config: LLMWikiConfig) {
    this.config = {
      projectRoot: config.projectRoot,
      wikiDir:
        config.wikiDir ??
        path.join((MemorySystem as any).rootFor(config.projectRoot), "wiki"),
      maxPageBodyChars: config.maxPageBodyChars ?? 8000,
    };
  }

  // ── Read ───────────────────────────────────────────────────────────────────

  async getPage(slug: string): Promise<WikiPage | null> {
    const p = this.pagePath(slug);
    try {
      const raw = await Bun.file(p).text();
      return JSON.parse(raw) as WikiPage;
    } catch {
      return null;
    }
  }

  async listPages(): Promise<WikiIndex["pages"]> {
    const index = await this.loadIndex();
    return index.pages;
  }

  async search(query: string): Promise<WikiPage[]> {
    const pages = await this.getAllPages();
    const q = query.toLowerCase();
    return pages.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.body.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
    );
  }

  // ── Write ──────────────────────────────────────────────────────────────────

  async upsertPage(
    slug: string,
    data: Omit<WikiPage, "slug" | "version" | "createdAt" | "updatedAt">
  ): Promise<WikiPage> {
    await mkdir(this.config.wikiDir, { recursive: true });
    const existing = await this.getPage(slug);
    const now = new Date().toISOString();

    const page: WikiPage = {
      slug,
      ...data,
      body: data.body.slice(0, this.config.maxPageBodyChars),
      version: existing ? existing.version + 1 : 1,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await Bun.write(this.pagePath(slug), JSON.stringify(page, null, 2));
    await this.rebuildIndex();
    return page;
  }

  async deletePage(slug: string): Promise<boolean> {
    const p = this.pagePath(slug);
    try {
      const { unlink } = await import("node:fs/promises");
      await unlink(p);
      await this.rebuildIndex();
      return true;
    } catch {
      return false;
    }
  }

  // ── Sync from Memory ───────────────────────────────────────────────────────

  /**
   * Called by KAIROS daemon — converts each reference-type memory entry
   * into a wiki page if it doesn't already exist or is stale.
   */
  async syncFromMemory(): Promise<{ created: number; updated: number }> {
    const memory = new MemorySystem({ projectRoot: this.config.projectRoot });
    const entries = await memory.list({ type: "reference" });

    let created = 0;
    let updated = 0;

    for (const entry of entries) {
      const slug = toSlug(entry.name);
      const existing = await this.getPage(slug);

      // Skip if page is newer than 24h and version >= 1
      if (existing) {
        const ageMs = Date.now() - new Date(existing.updatedAt).getTime();
        if (ageMs < 24 * 60 * 60 * 1000) continue;
        updated++;
      } else {
        created++;
      }

      await this.upsertPage(slug, {
        title: entry.name,
        body: `## ${entry.name}\n\n${entry.description ?? ""}\n\n${entry.body ?? ""}`.trim(),
        tags: entry.tags ?? [],
        sourceMemoryIds: [entry.id],
      });
    }

    return { created, updated };
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private pagePath(slug: string): string {
    return path.join(this.config.wikiDir, `${slug}.json`);
  }

  private async getAllPages(): Promise<WikiPage[]> {
    const pages: WikiPage[] = [];
    await mkdir(this.config.wikiDir, { recursive: true });
    const glob = new Glob("*.json");
    for await (const file of glob.scan({
      cwd: this.config.wikiDir,
      onlyFiles: true,
    })) {
      if (file === "index.json") continue;
      try {
        const raw = await Bun.file(path.join(this.config.wikiDir, file)).text();
        pages.push(JSON.parse(raw) as WikiPage);
      } catch { /* skip corrupt */ }
    }
    return pages;
  }

  private async loadIndex(): Promise<WikiIndex> {
    try {
      const raw = await Bun.file(
        path.join(this.config.wikiDir, "index.json")
      ).text();
      return JSON.parse(raw) as WikiIndex;
    } catch {
      return { pages: [], generatedAt: new Date().toISOString() };
    }
  }

  private async rebuildIndex(): Promise<void> {
    const pages = await this.getAllPages();
    const index: WikiIndex = {
      pages: pages.map((p) => ({
        slug: p.slug,
        title: p.title,
        tags: p.tags,
        updatedAt: p.updatedAt,
        version: p.version,
      })),
      generatedAt: new Date().toISOString(),
    };
    await Bun.write(
      path.join(this.config.wikiDir, "index.json"),
      JSON.stringify(index, null, 2)
    );
  }
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
