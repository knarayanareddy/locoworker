import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TranscriptLog } from "../src/memdir/Transcript.js";

describe("TranscriptLog (--resume)", () => {
  test("round-trips a session's history and ignores other sessions", async () => {
    const root = await mkdtemp(join(tmpdir(), "cowork-transcript-"));
    try {
      const log = new TranscriptLog(root);
      await log.append("sess_a", [
        { role: "user", content: "first question" },
        { role: "assistant", content: "first answer" },
      ]);
      await log.append("sess_b", [{ role: "user", content: "other session" }]);
      await log.append("sess_a", [
        { role: "user", content: "second question" },
        { role: "assistant", content: "second answer" },
      ]);

      const history = await log.readSession("sess_a");
      expect(history.map((m) => `${m.role}:${m.content}`)).toEqual([
        "user:first question",
        "assistant:first answer",
        "user:second question",
        "assistant:second answer",
      ]);
      expect(await log.readSession("missing")).toEqual([]);
      expect((await log.readSession("sess_a", 2)).length).toBe(2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
