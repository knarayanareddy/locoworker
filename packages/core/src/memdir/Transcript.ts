import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Message } from "../types.js";

/**
 * Append-only daily transcript log. AutoDream consumes recent transcripts
 * to find new memories worth saving and contradictions worth resolving.
 */
export class TranscriptLog {
  constructor(private readonly root: string) {}

  private pathFor(date: Date): string {
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(date.getUTCDate()).padStart(2, "0");
    return join(this.root, "transcripts", `${yyyy}-${mm}-${dd}.md`);
  }

  async append(sessionId: string, messages: Message[]): Promise<void> {
    const path = this.pathFor(new Date());
    await mkdir(dirname(path), { recursive: true });
    const ts = new Date().toISOString();

    let text = "";
    for (const m of messages) {
      const content = typeof m.content === "string" 
        ? m.content 
        : m.content.map(b => b.type === "text" ? b.text : `[${b.type}]`).join("\n");
      text += `\n[${ts}] [${sessionId}] ${m.role}\n${content.trimEnd()}\n`;
    }

    await appendFile(path, text, "utf8");
  }
}
