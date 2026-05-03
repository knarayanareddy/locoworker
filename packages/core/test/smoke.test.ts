import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  queryLoop,
  QueryEngine,
  DEFAULT_TOOLS,
  PermissionLevel,
  type CallOptions,
  type Provider,
  type ModelResponse,
  type AgentEvent,
} from "../src/index.js";
import { checkBashCommand } from "../src/tools/bash/BashSecurity.js";

class StubProvider implements Provider {
  readonly name = "ollama" as const;
  readonly model = "stub";
  private calls = 0;
  constructor(private readonly responses: ModelResponse[]) {}
  async call(_options: CallOptions): Promise<ModelResponse> {
    const r = this.responses[this.calls++];
    if (!r) throw new Error(`StubProvider: ran out of responses at call ${this.calls}`);
    return r;
  }
}

async function runToCompletion(input: string, provider: Provider, cwd: string): Promise<AgentEvent[]> {
  const engine = new QueryEngine(provider, {
    maxRetries: 0,
    initialDelayMs: 0,
    backoffMultiplier: 1,
  });
  const events: AgentEvent[] = [];
  for await (const e of queryLoop(input, {
    engine,
    tools: DEFAULT_TOOLS,
    systemPrompt: "test",
    workingDirectory: cwd,
    permissionLevel: PermissionLevel.STANDARD,
    maxTurns: 5,
  })) {
    events.push(e);
  }
  return events;
}

describe("BashSecurity", () => {
  test("rejects rm -rf /", () => {
    expect(checkBashCommand("rm -rf /").safe).toBe(false);
  });
  test("rejects fork bombs", () => {
    expect(checkBashCommand(":(){ :|:& };:").safe).toBe(false);
  });
  test("rejects null bytes", () => {
    expect(checkBashCommand("ls\x00rm").safe).toBe(false);
  });
  test("allows ordinary commands", () => {
    expect(checkBashCommand("ls -la").safe).toBe(true);
    expect(checkBashCommand("git status").safe).toBe(true);
  });
});

describe("queryLoop", () => {
  test("reads a file via Read tool, then completes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cowork-test-"));
    try {
      await writeFile(join(dir, "hello.txt"), "world\n", "utf8");

      const provider = new StubProvider([
        {
          stopReason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "call_1",
              name: "Read",
              input: { path: "hello.txt" },
            },
          ],
          usage: { inputTokens: 10, outputTokens: 5 },
          model: "stub",
        },
        {
          stopReason: "end_turn",
          content: [{ type: "text", text: "The file says: world" }],
          usage: { inputTokens: 20, outputTokens: 6 },
          model: "stub",
        },
      ]);

      const events = await runToCompletion("read hello.txt", provider, dir);
      const toolResult = events.find((e) => e.type === "tool_result");
      const complete = events.find((e) => e.type === "complete");

      expect(toolResult).toBeDefined();
      if (toolResult?.type === "tool_result") {
        expect(toolResult.isError).toBe(false);
        expect(toolResult.result).toContain("world");
      }
      expect(complete).toBeDefined();
      if (complete?.type === "complete") {
        expect(complete.usage.inputTokens).toBe(30);
        expect(complete.usage.outputTokens).toBe(11);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("Edit tool replaces a unique string", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cowork-test-"));
    try {
      await writeFile(join(dir, "f.txt"), "alpha beta gamma\n", "utf8");

      const provider = new StubProvider([
        {
          stopReason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "edit_1",
              name: "Edit",
              input: { path: "f.txt", old_string: "beta", new_string: "BETA" },
            },
          ],
          usage: { inputTokens: 1, outputTokens: 1 },
          model: "stub",
        },
        {
          stopReason: "end_turn",
          content: [{ type: "text", text: "done" }],
          usage: { inputTokens: 1, outputTokens: 1 },
          model: "stub",
        },
      ]);

      await runToCompletion("edit f.txt", provider, dir);
      const after = await readFile(join(dir, "f.txt"), "utf8");
      expect(after).toBe("alpha BETA gamma\n");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("Write tool blocked under READ_ONLY permission", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cowork-test-"));
    try {
      const provider = new StubProvider([
        {
          stopReason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "w_1",
              name: "Write",
              input: { path: "new.txt", content: "x" },
            },
          ],
          usage: { inputTokens: 1, outputTokens: 1 },
          model: "stub",
        },
        {
          stopReason: "end_turn",
          content: [{ type: "text", text: "blocked" }],
          usage: { inputTokens: 1, outputTokens: 1 },
          model: "stub",
        },
      ]);

      const engine = new QueryEngine(provider, {
        maxRetries: 0,
        initialDelayMs: 0,
        backoffMultiplier: 1,
      });
      const events: AgentEvent[] = [];
      for await (const e of queryLoop("write new.txt", {
        engine,
        tools: DEFAULT_TOOLS,
        systemPrompt: "test",
        workingDirectory: dir,
        permissionLevel: PermissionLevel.READ_ONLY,
        maxTurns: 5,
      })) {
        events.push(e);
      }

      const denied = events.find((e) => e.type === "permission_denied");
      expect(denied).toBeDefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
