import { homedir } from "node:os";
import { join, basename, resolve } from "node:path";
import { MemoryStore } from "./MemoryStore.js";
import { MemoryIndex } from "./MemoryIndex.js";
import { TranscriptLog } from "./Transcript.js";
import { HybridSearch, type SearchResult } from "./HybridSearch.js";
import {
  type MemoryDraft,
  type MemoryEntry,
  type MemoryFilter,
  type MemoryType,
} from "./MemoryTypes.js";

export type MemorySystemOptions = {
  projectRoot: string;
  homeRoot?: string; // override for tests
  embedderUrl?: string;
  embedderModel?: string;
};

/**
 * Facade that wires MemoryStore + MemoryIndex + TranscriptLog + HybridSearch
 * together and exposes a small surface to the rest of the system.
 */
export class MemorySystem {
  readonly store: MemoryStore;
  readonly index: MemoryIndex;
  readonly transcripts: TranscriptLog;
  readonly search: HybridSearch;

  static rootFor(projectRoot: string, homeRoot: string = homedir()): string {
    const projectName = sanitize(basename(resolve(projectRoot)));
    return join(homeRoot, ".cowork", "projects", projectName);
  }

  constructor(opts: MemorySystemOptions) {
    const projectRoot = opts.projectRoot;
    const homeRoot = opts.homeRoot ?? homedir();
    const root = MemorySystem.rootFor(projectRoot, homeRoot);
    this.store = new MemoryStore(join(root, "memory"));
    this.index = new MemoryIndex(join(root, "memory"));
    this.transcripts = new TranscriptLog(root);
    this.search = new HybridSearch({
      embedderUrl: opts.embedderUrl,
      embedderModel: opts.embedderModel,
    });
  }

  async save(draft: MemoryDraft): Promise<MemoryEntry> {
    const entry = await this.store.save(draft);
    await this.rebuildIndex();
    return entry;
  }

  async delete(type: MemoryType, id: string): Promise<boolean> {
    const ok = await this.store.delete(type, id);
    if (ok) await this.rebuildIndex();
    return ok;
  }

  async list(filter: MemoryFilter = {}): Promise<MemoryEntry[]> {
    return this.store.list(filter);
  }

  async query(text: string, limit = 5, filter: MemoryFilter = {}): Promise<SearchResult[]> {
    const candidates = await this.store.list({ ...filter, limit: undefined });
    return this.search.search(text, candidates, limit);
  }

  async readIndex(): Promise<string> {
    return this.index.read();
  }

  async rebuildIndex(): Promise<void> {
    const all = await this.store.list();
    await this.index.rebuild(all);
  }

  async appendTranscript(sessionId: string, role: string, content: string): Promise<void> {
    await this.transcripts.append(sessionId, role, content);
  }
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_") || "default";
}
