import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ContextCompressor,
  DEFAULT_TOOLS,
  MemorySystem,
  PermissionLevel,
  QueryEngine,
  SYSTEM_PROMPT,
  assembleSystemPrompt,
  makeMemoryTools,
  queryLoop,
  type AgentEvent,
  type CallOptions,
  type ModelResponse,
  type Provider,
} from "../src/index.js";

class StubProvider implements Provider {
  readonly name = "ollama" as const;
  readonly model = "stub";
  public lastCallMessages: CallOptions["messages"] = [];
  public lastSystemPrompt = "";
  private calls = 0;
  constructor(private readonly responses: ModelResponse[]) {}
  async call(options: CallOptions): Promise<ModelResponse> {
    this.lastCallMessages = options.messages;
    this.lastSystemPrompt = options.systemPrompt;
    const r = this.responses[this.calls++];
    if (!r) throw new Error(`stub ran out of responses at call ${this.calls}`);
    return r;
  }
}

describe("memory persistence across sessions", () => {
  test("memory saved in session A is visible in session B's system prompt", async () => {
    const home = await mkdtemp(join(tmpdir(), "cowork-int-"));
    const project = await mkdtemp(join(tmpdir(), "cowork-proj-"));

    try {
      // ── Session A ─────────────────────────────────────────────────────
      const memA = new MemorySystem({ projectRoot: project, homeRoot: home });
      await memA.store.init();

      const providerA = new StubProvider([
        {
          stopReason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "save_1",
              name: "MemorySave",
              input: {
                type: "feedback",
                name: "TS strict mode is mandatory",
                description: "All projects in this org use strict TS",
                body: "We always enable strict TS. Caught critical bugs in Q4 2025.",
                tags: ["typescript"],
              },
            },
          ],
          usage: { inputTokens: 1, outputTokens: 1 },
          model: "stub",
        },
        {
          stopReason: "end_turn",
          content: [{ type: "text", text: "saved." }],
          usage: { inputTokens: 1, outputTokens: 1 },
          model: "stub",
        },
      ]);
      const engineA = new QueryEngine(providerA, {
        maxRetries: 0,
        initialDelayMs: 0,
        backoffMultiplier: 1,
      });
      const sessionId = "session_A";
      const toolsA = makeMemoryTools(memA, sessionId);
      const compressorA = new ContextCompressor(engineA);

      const eventsA: AgentEvent[] = [];
      for await (const e of queryLoop("remember TS strict mode", {
        engine: engineA,
        tools: toolsA,
        systemPrompt: SYSTEM_PROMPT,
        workingDirectory: project,
        permissionLevel: PermissionLevel.STANDARD,
        compressor: compressorA,
      })) {
        eventsA.push(e);
      }

      const stored = await memA.list({ type: "feedback" });
      expect(stored).toHaveLength(1);
      expect(stored[0]?.body).toContain("strict TS");

      // ── Session B (fresh process simulation) ─────────────────────────
      const memB = new MemorySystem({ projectRoot: project, homeRoot: home });
      await memB.store.init();

      const promptB = await assembleSystemPrompt(SYSTEM_PROMPT, project, memB);
      expect(promptB).toContain("Long-term memory index");
      expect(promptB).toContain("TS strict mode is mandatory");

      // The memory tool can also retrieve it directly
      const results = await memB.query("typescript strict", 5);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.entry.body).toContain("strict TS");
    } finally {
      await rm(home, { recursive: true, force: true });
      await rm(project, { recursive: true, force: true });
    }
  });
});

describe("CLAUDE.md is folded into the system prompt", () => {
  test("readable CLAUDE.md content is appended", async () => {
    const project = await mkdtemp(join(tmpdir(), "cowork-cmd-"));
    try {
      await Bun.write(
        join(project, "CLAUDE.md"),
        "# Project rules\n\n- always run typecheck\n- never commit secrets\n",
      );
      const home = await mkdtemp(join(tmpdir(), "cowork-home-"));
      const mem = new MemorySystem({ projectRoot: project, homeRoot: home });
      await mem.store.init();
      const prompt = await assembleSystemPrompt(SYSTEM_PROMPT, project, mem);
      expect(prompt).toContain("Project rules");
      expect(prompt).toContain("always run typecheck");
      await rm(home, { recursive: true, force: true });
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });
});

describe("queryLoop integrates compression", () => {
  test("MicroCompact trims a large tool result before history", async () => {
    const project = await mkdtemp(join(tmpdir(), "cowork-cmp-"));
    try {
      await Bun.write(
        join(project, "big.txt"),
        "line\n".repeat(20_000), // ~100KB
      );
      const provider = new StubProvider([
        {
          stopReason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "r_1",
              name: "Read",
              input: { path: "big.txt" },
            },
          ],
          usage: { inputTokens: 1, outputTokens: 1 },
          model: "stub",
        },
        {
          stopReason: "end_turn",
          content: [{ type: "text", text: "ok" }],
          usage: { inputTokens: 1, outputTokens: 1 },
          model: "stub",
        },
      ]);
      const engine = new QueryEngine(provider, {
        maxRetries: 0,
        initialDelayMs: 0,
        backoffMultiplier: 1,
      });
      const compressor = new ContextCompressor(engine, { microCompactCharLimit: 2_000 });

      const events: AgentEvent[] = [];
      for await (const e of queryLoop("read big.txt", {
        engine,
        tools: DEFAULT_TOOLS,
        systemPrompt: "test",
        workingDirectory: project,
        permissionLevel: PermissionLevel.STANDARD,
        compressor,
      })) {
        events.push(e);
      }

      const toolResult = events.find((e) => e.type === "tool_result");
      expect(toolResult).toBeDefined();
      if (toolResult?.type === "tool_result") {
        expect(toolResult.result.length).toBeLessThan(2_500);
        expect(toolResult.result).toContain("elided by MicroCompact");
      }
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });
});
