import { homedir } from "node:os";
import { join, basename, resolve } from "node:path";
import { MemoryStore } from "./MemoryStore.js";
import { MemoryIndex } from "./MemoryIndex.js";
import { TranscriptLog } from "./Transcript.js";
import { HybridSearch } from "./HybridSearch.js";
/**
 * Facade that wires MemoryStore + MemoryIndex + TranscriptLog + HybridSearch
 * together and exposes a small surface to the rest of the system.
 */
export class MemorySystem {
    store;
    index;
    transcripts;
    search;
    static rootFor(projectRoot, homeRoot = homedir()) {
        const projectName = sanitize(basename(resolve(projectRoot)));
        return join(homeRoot, ".cowork", "projects", projectName);
    }
    constructor(opts) {
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
    async save(draft) {
        const entry = await this.store.save(draft);
        await this.rebuildIndex();
        return entry;
    }
    async delete(type, id) {
        const ok = await this.store.delete(type, id);
        if (ok)
            await this.rebuildIndex();
        return ok;
    }
    async list(filter = {}) {
        return this.store.list(filter);
    }
    async query(text, limit = 5, filter = {}) {
        const candidates = await this.store.list({ ...filter, limit: undefined });
        return this.search.search(text, candidates, limit);
    }
    async readIndex() {
        return this.index.read();
    }
    async rebuildIndex() {
        const all = await this.store.list();
        await this.index.rebuild(all);
    }
    async appendTranscript(sessionId, role, content) {
        await this.transcripts.append(sessionId, role, content);
    }
}
function sanitize(name) {
    return name.replace(/[^a-zA-Z0-9._-]/g, "_") || "default";
}
//# sourceMappingURL=MemorySystem.js.map