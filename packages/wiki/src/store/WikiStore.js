import { join, resolve } from "node:path";
import { mkdir, readFile, writeFile, readdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
export class WikiStore {
    wikiDir;
    constructor(projectRoot) {
        // Per-project wiki lives inside the project's .cowork folder
        this.wikiDir = join(resolve(projectRoot), ".cowork", "wiki");
    }
    async init() {
        await mkdir(this.wikiDir, { recursive: true });
    }
    async create(opts) {
        const now = new Date().toISOString();
        const slug = opts.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
        const page = {
            id: randomUUID(),
            title: opts.title,
            slug,
            sources: opts.sources ?? [],
            body: opts.body ?? "",
            tags: opts.tags ?? [],
            createdAt: now,
            updatedAt: now,
            readCount: 0,
            confidence: opts.confidence ?? 0.8,
        };
        await this.save(page);
        return page;
    }
    async update(id, patch) {
        const page = await this.getById(id);
        if (!page)
            return null;
        const updated = {
            ...page,
            ...patch,
            id: page.id,
            updatedAt: new Date().toISOString(),
        };
        await this.save(updated);
        return updated;
    }
    async upsertPage(slug, opts) {
        const existing = await this.getBySlug(slug);
        if (existing) {
            return (await this.update(existing.id, {
                title: opts.title,
                body: opts.body,
                tags: opts.tags,
                sources: opts.sourceMemoryIds,
            }));
        }
        else {
            const page = {
                id: randomUUID(),
                title: opts.title,
                slug,
                sources: opts.sourceMemoryIds,
                body: opts.body,
                tags: opts.tags,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                readCount: 0,
                confidence: 0.8,
            };
            await this.save(page);
            return page;
        }
    }
    async getById(id) {
        try {
            const files = await readdir(this.wikiDir);
            for (const f of files.filter((f) => f.endsWith(".json"))) {
                const raw = await readFile(join(this.wikiDir, f), "utf-8");
                const page = JSON.parse(raw);
                if (page.id === id)
                    return page;
            }
            return null;
        }
        catch {
            return null;
        }
    }
    async getBySlug(slug) {
        const path = join(this.wikiDir, `${slug}.json`);
        if (!existsSync(path))
            return null;
        try {
            const raw = await readFile(path, "utf-8");
            return JSON.parse(raw);
        }
        catch {
            return null;
        }
    }
    async list() {
        if (!existsSync(this.wikiDir))
            return [];
        try {
            const files = await readdir(this.wikiDir);
            const pages = await Promise.all(files
                .filter((f) => f.endsWith(".json"))
                .map(async (f) => {
                try {
                    const raw = await readFile(join(this.wikiDir, f), "utf-8");
                    return JSON.parse(raw);
                }
                catch {
                    return null;
                }
            }));
            return pages
                .filter((p) => p !== null)
                .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        }
        catch {
            return [];
        }
    }
    async delete(id) {
        const page = await this.getById(id);
        if (!page)
            return false;
        try {
            await unlink(join(this.wikiDir, `${page.slug}.json`));
            return true;
        }
        catch {
            return false;
        }
    }
    async search(query, limit = 10) {
        const pages = await this.list();
        const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
        const scored = pages.map((page) => {
            let score = 0;
            let via = "combined";
            for (const term of terms) {
                if (page.title.toLowerCase().includes(term)) {
                    score += 3;
                    via = "title";
                }
                if (page.body.toLowerCase().includes(term)) {
                    score += 1;
                    via = "body";
                }
                if (page.tags.some((t) => t.toLowerCase().includes(term))) {
                    score += 2;
                    via = "tag";
                }
            }
            return { page, score, via };
        });
        return scored
            .filter((r) => r.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }
    async incrementReadCount(id) {
        const page = await this.getById(id);
        if (page)
            await this.update(id, { readCount: page.readCount + 1 });
    }
    /** Export the entire wiki as a WIKI_INDEX.md for agent consumption */
    async exportIndex() {
        const pages = await this.list();
        if (pages.length === 0)
            return "# Wiki\n\nNo wiki pages yet.\n";
        const lines = [
            "# Project Wiki",
            `*${pages.length} pages — updated ${new Date().toISOString().slice(0, 10)}*`,
            "",
        ];
        for (const page of pages) {
            const tags = page.tags.length ? ` [${page.tags.join(", ")}]` : "";
            lines.push(`## ${page.title}${tags}`);
            if (page.body) {
                lines.push(page.body.slice(0, 300) + (page.body.length > 300 ? "..." : ""));
            }
            lines.push("");
        }
        return lines.join("\n");
    }
    async save(page) {
        const path = join(this.wikiDir, `${page.slug}.json`);
        await writeFile(path, JSON.stringify(page, null, 2), "utf-8");
    }
}
//# sourceMappingURL=WikiStore.js.map