import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type MemoryDraft,
  type MemoryEntry,
  type MemoryFilter,
  type MemoryType,
  MEMORY_TYPES,
  isMemoryType,
} from "./MemoryTypes.js";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter.js";

/**
 * File-backed CRUD for memory entries.
 *
 * Layout:
 *   <root>/
 *     MEMORY.md            ← index, owned by MemoryIndex (peer)
 *     user/<id>.md
 *     feedback/<id>.md
 *     project/<id>.md
 *     reference/<id>.md
 */
export class MemoryStore {
  constructor(private readonly root: string) {}

  async init(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    for (const t of MEMORY_TYPES) {
      await mkdir(join(this.root, t), { recursive: true });
    }
  }

  async save(draft: MemoryDraft): Promise<MemoryEntry> {
    await this.init();
    const now = new Date().toISOString();
    const id = draft.id ?? generateId(draft.name);

    let createdAt = now;
    const existing = await this.tryLoad(draft.type, id);
    if (existing) createdAt = existing.createdAt;

    const entry: MemoryEntry = {
      id,
      type: draft.type,
      name: draft.name,
      description: draft.description,
      body: draft.body,
      tags: draft.tags ?? [],
      sessionId: draft.sessionId,
      confidence: draft.confidence ?? 1,
      createdAt,
      updatedAt: now,
    };

    const path = this.pathFor(entry.type, entry.id);
    await writeFile(path, formatEntry(entry), "utf8");
    return entry;
  }

  async tryLoad(type: MemoryType, id: string): Promise<MemoryEntry | null> {
    try {
      const raw = await readFile(this.pathFor(type, id), "utf8");
      return parseEntry(raw, type, id);
    } catch {
      return null;
    }
  }

  async delete(type: MemoryType, id: string): Promise<boolean> {
    try {
      await unlink(this.pathFor(type, id));
      return true;
    } catch {
      return false;
    }
  }

  async list(filter: MemoryFilter = {}): Promise<MemoryEntry[]> {
    const types = filter.type ? [filter.type] : MEMORY_TYPES;
    const out: MemoryEntry[] = [];
    for (const t of types) {
      const dir = join(this.root, t);
      let entries: string[];
      try {
        entries = await readdir(dir);
      } catch {
        continue;
      }
      for (const name of entries) {
        if (!name.endsWith(".md")) continue;
        const id = name.replace(/\.md$/, "");
        const entry = await this.tryLoad(t, id);
        if (!entry) continue;
        if (filter.tags && !filter.tags.every((tag) => entry.tags.includes(tag))) continue;
        out.push(entry);
      }
    }
    out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (filter.limit) return out.slice(0, filter.limit);
    return out;
  }

  pathFor(type: MemoryType, id: string): string {
    return join(this.root, type, `${id}.md`);
  }

  get rootPath(): string {
    return this.root;
  }
}

function formatEntry(entry: MemoryEntry): string {
  const fm = serializeFrontmatter({
    name: entry.name,
    description: entry.description,
    type: entry.type,
    tags: entry.tags,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    sessionId: entry.sessionId ?? "",
    confidence: entry.confidence,
  });
  return `${fm}${entry.body.trimEnd()}\n`;
}

function parseEntry(raw: string, fallbackType: MemoryType, id: string): MemoryEntry {
  const { frontmatter, body } = parseFrontmatter(raw);
  const type = isMemoryType(String(frontmatter.type ?? "")) ? (frontmatter.type as MemoryType) : fallbackType;
  return {
    id,
    type,
    name: String(frontmatter.name ?? id),
    description: String(frontmatter.description ?? ""),
    body: body.trim(),
    tags: Array.isArray(frontmatter.tags) ? (frontmatter.tags as string[]) : [],
    createdAt: String(frontmatter.createdAt ?? new Date().toISOString()),
    updatedAt: String(frontmatter.updatedAt ?? new Date().toISOString()),
    sessionId:
      frontmatter.sessionId && String(frontmatter.sessionId).length > 0
        ? String(frontmatter.sessionId)
        : null,
    confidence: typeof frontmatter.confidence === "number" ? frontmatter.confidence : 1,
  };
}

function generateId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  const stamp = Date.now().toString(36);
  return slug ? `${slug}_${stamp}` : `mem_${stamp}`;
}
