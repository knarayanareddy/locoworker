// packages/core/src/memdir/MemorySystem.ts
// PHASE 5 FIX: embedderApiKey is now passed through to HybridSearch → Embedder.

import { join } from "node:path";
import { homedir } from "node:os";
import { basename, resolve } from "node:path";
import { MemoryStore } from "./MemoryStore.js";
import { MemoryIndex } from "./MemoryIndex.js";
import { TranscriptLog } from "./Transcript.js";
import { HybridSearch } from "./HybridSearch.js";
import type { MemoryEntry, MemoryType } from "./MemoryTypes.js";

export interface MemorySystemOptions {
  projectRoot: string;
  embedderUrl?: string;
  embedderModel?: string;
  /** PHASE 5 FIX: now threaded through to Embedder */
  embedderApiKey?: string;
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-]/g, "_").slice(0, 64);
}

export class MemorySystem {
  readonly store: MemoryStore;
  readonly index: MemoryIndex;
  private readonly transcript: TranscriptLog;
  private readonly search: HybridSearch;
  readonly root: string;

  static rootFor(projectRoot: string): string {
    const key = sanitize(basename(resolve(projectRoot)));
    return join(homedir(), ".cowork", "projects", key);
  }

  constructor(opts: MemorySystemOptions) {
    const root = MemorySystem.rootFor(opts.projectRoot);
    this.root = root;
    const memRoot = join(root, "memory");

    this.store = new MemoryStore(memRoot);
    this.index = new MemoryIndex(memRoot);
    this.transcript = new TranscriptLog(root);
    // ── PHASE 5 FIX: pass embedderApiKey ───────────────────────────────────
    this.search = new HybridSearch({
      embedderUrl: opts.embedderUrl,
      embedderModel: opts.embedderModel,
      embedderApiKey: opts.embedderApiKey,
    });
  }

  async save(draft: Omit<MemoryEntry, "id" | "createdAt" | "updatedAt">): Promise<MemoryEntry> {
    const entry = await this.store.save(draft);
    await this.index.rebuild(await this.store.list());
    return entry;
  }

  async delete(type: MemoryType, id: string): Promise<boolean> {
    const deleted = await this.store.delete(type, id);
    if (deleted) await this.index.rebuild(await this.store.list());
    return deleted;
  }

  async list(filter?: { type?: MemoryType; tag?: string; limit?: number }): Promise<MemoryEntry[]> {
    return this.store.list(filter);
  }

  async query(text: string, limit = 10, filter?: { type?: MemoryType }): Promise<MemoryEntry[]> {
    const candidates = await this.store.list(filter ? { type: filter.type, limit: 200 } : { limit: 200 });
    return this.search.search(text, candidates, limit);
  }

  async readIndex(): Promise<string> {
    return this.index.read();
  }

  async appendTranscript(sessionId: string, role: string, content: string): Promise<void> {
    await this.transcript.append(sessionId, role, content);
  }
}
