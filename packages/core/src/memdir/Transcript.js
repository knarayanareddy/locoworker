import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
/**
 * Append-only daily transcript log. AutoDream consumes recent transcripts
 * to find new memories worth saving and contradictions worth resolving.
 */
export class TranscriptLog {
    root;
    constructor(root) {
        this.root = root;
    }
    pathFor(date) {
        const yyyy = date.getUTCFullYear();
        const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(date.getUTCDate()).padStart(2, "0");
        return join(this.root, "transcripts", `${yyyy}-${mm}-${dd}.md`);
    }
    async append(sessionId, role, content) {
        const path = this.pathFor(new Date());
        await mkdir(dirname(path), { recursive: true });
        const ts = new Date().toISOString();
        const line = `\n[${ts}] [${sessionId}] ${role}\n${content.trimEnd()}\n`;
        await appendFile(path, line, "utf8");
    }
}
//# sourceMappingURL=Transcript.js.map