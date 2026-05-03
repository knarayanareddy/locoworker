import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { MemoryEntry } from "./MemoryTypes.js";

/**
 * MEMORY.md is the always-loaded entry point — one line per memory pointer,
 * grouped by type, hard-capped at 200 lines so the index never blows up the
 * context window.
 */
export class MemoryIndex {
  static readonly MAX_LINES = 200;

  constructor(private readonly root: string) {}

  get path(): string {
    return join(this.root, "MEMORY.md");
  }

  async read(): Promise<string> {
    try {
      const raw = await readFile(this.path, "utf8");
      const lines = raw.split("\n");
      if (lines.length <= MemoryIndex.MAX_LINES) return raw;
      return lines.slice(0, MemoryIndex.MAX_LINES).join("\n") + "\n";
    } catch {
      return "";
    }
  }

  async rebuild(entries: MemoryEntry[]): Promise<void> {
    const grouped = new Map<string, MemoryEntry[]>();
    for (const e of entries) {
      const list = grouped.get(e.type) ?? [];
      list.push(e);
      grouped.set(e.type, list);
    }

    const lines: string[] = ["# Memory Index", ""];

    for (const type of ["user", "feedback", "project", "reference"]) {
      const list = grouped.get(type);
      if (!list || list.length === 0) continue;
      lines.push(`## ${type}`);
      list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      for (const e of list) {
        const hook = trimToFirstSentence(e.description, 120);
        lines.push(`- [${e.name}](${e.type}/${e.id}.md) — ${hook}`);
      }
      lines.push("");
    }

    // Hard-cap at MAX_LINES; we measure by the number of lines a reader
    // sees after split("\n"), so don't emit a trailing newline that would
    // push the count over.
    if (lines.length > MemoryIndex.MAX_LINES) {
      lines.length = MemoryIndex.MAX_LINES;
    }
    await writeFile(this.path, lines.join("\n"), "utf8");
  }
}

function trimToFirstSentence(s: string, max: number): string {
  const flat = s.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastBreak = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "));
  if (lastBreak > max - 30) return cut.slice(0, lastBreak + 1);
  return cut + "…";
}
