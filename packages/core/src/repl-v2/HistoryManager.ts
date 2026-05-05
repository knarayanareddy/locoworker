/**
 * Persistent REPL history with search.
 * Compatible with readline history format.
 */

import { homedir } from "node:os";
import path from "path";
import mkdir from "node:fs/promises";
import { getCoworkHome } from "../state/Settings.js";

const HISTORY_FILE = path.join(getCoworkHome(), "repl-history");
const MAX_HISTORY = 1000;

export class HistoryManager {
  private entries: string[] = [];
  private cursor = -1;
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await Bun.file(HISTORY_FILE).text();
      this.entries = raw
        .split("\n")
        .filter(Boolean)
        .slice(-MAX_HISTORY);
    } catch { /* new history */ }
    this.loaded = true;
    this.cursor = this.entries.length;
  }

  async push(entry: string): Promise<void> {
    if (!entry.trim()) return;
    // Remove duplicate if same as last
    if (this.entries[this.entries.length - 1] === entry) return;
    this.entries.push(entry);
    if (this.entries.length > MAX_HISTORY) {
      this.entries.shift();
    }
    this.cursor = this.entries.length;
    await this.persist();
  }

  prev(): string | null {
    if (this.entries.length === 0) return null;
    this.cursor = Math.max(0, this.cursor - 1);
    return this.entries[this.cursor] ?? null;
  }

  next(): string | null {
    this.cursor = Math.min(this.entries.length, this.cursor + 1);
    return this.entries[this.cursor] ?? "";
  }

  search(query: string): string[] {
    const q = query.toLowerCase();
    return this.entries
      .filter((e) => e.toLowerCase().includes(q))
      .slice(-20)
      .reverse();
  }

  all(): string[] {
    return [...this.entries];
  }

  private async persist(): Promise<void> {
    // @ts-ignore
    await mkdir(path.dirname(HISTORY_FILE), { recursive: true });
    await Bun.write(HISTORY_FILE, this.entries.join("\n") + "\n");
  }
}
