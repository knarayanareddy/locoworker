/**
 * Regression tests for the P0 red-team findings (F-01, F-04, F-05, F-16).
 *
 * These assert the *security property*, not just the happy path: hostile
 * inputs must be rejected before any tool code or filesystem write runs.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  queryLoop,
  QueryEngine,
  PermissionLevel,
  type Provider,
  type ModelResponse,
  type CallOptions,
  type AgentEvent,
} from "../src/index.js";
import type { ToolDefinition } from "../src/Tool.js";
import { validateToolInput } from "../src/tools/validateToolInput.js";
import { JsonQuery, queryJsonPath } from "../src/tools/extended/JsonQuery.js";
import { isSafeId, assertSafeId } from "../src/utils/safeId.js";
import { ensurePrivateDir, writePrivateFile, appendPrivateFile } from "../src/utils/secureFile.js";
import { guardPath } from "../src/tools/files/pathGuard.js";
import { SessionManager } from "../src/session/SessionManager.js";
import { MemoryStore } from "../src/memdir/MemoryStore.js";

const schemaTool: ToolDefinition = {
  name: "Example",
  description: "example",
  permissionLevel: PermissionLevel.READ_ONLY,
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string" },
      count: { type: "integer" },
      tags: { type: "array", items: { type: "string" } },
    },
    required: ["path"],
    additionalProperties: false,
  },
  async execute() {
    return { content: "ok", isError: false };
  },
};

class StubProvider implements Provider {
  readonly name = "ollama" as const;
  readonly model = "stub";
  private index = 0;
  constructor(private responses: ModelResponse[]) {}
  async call(_options: CallOptions): Promise<ModelResponse> {
    const r = this.responses[this.index++];
    if (!r) throw new Error("StubProvider ran out of responses");
    return r;
  }
}

const response = (content: ModelResponse["content"], stopReason: ModelResponse["stopReason"]): ModelResponse => ({
  content,
  stopReason,
  usage: { inputTokens: 1, outputTokens: 1 },
  model: "stub",
});

describe("F-01: JsonQuery no longer evaluates arbitrary JavaScript", () => {
  test("a process.version expression is a plain lookup, not code execution", () => {
    expect(queryJsonPath({ process: { version: "safe" } }, "process.version")).toBe("safe");
    expect(queryJsonPath({}, "process.version")).toBeUndefined();
    expect(() => queryJsonPath({}, "constructor.constructor('return process')()")).toThrow();
    expect(() => queryJsonPath({}, "__proto__.polluted")).toThrow(/Unsafe query/);
    expect(() => queryJsonPath({}, "a[0]; require('fs')")).toThrow(/Unsupported query/);
  });

  test("JsonQuery.execute returns null for a non-existent path and never leaks process state", async () => {
    const result = await JsonQuery.execute({ json: "{\"a\":1}", query: "process.version" }, {
      workingDirectory: "/tmp",
      permissionLevel: PermissionLevel.READ_ONLY,
    });
    expect(result.isError).toBe(false);
    expect(result.content).toBe("null");
  });
});

describe("F-16: inputSchema is enforced before tool execution", () => {
  test("rejects missing required keys, wrong types, bad array items and oversized values", () => {
    expect(validateToolInput(schemaTool, { path: "a.txt" }).valid).toBe(true);
    expect(validateToolInput(schemaTool, {}).valid).toBe(false);
    expect(validateToolInput(schemaTool, { path: 42 }).valid).toBe(false);
    expect(validateToolInput(schemaTool, { path: "a", count: 1.5 }).valid).toBe(false);
    expect(validateToolInput(schemaTool, { path: "a", tags: [1] }).valid).toBe(false);
    expect(validateToolInput(schemaTool, { path: "a", extra: true }).valid).toBe(false);
    expect(validateToolInput(schemaTool, "not an object").valid).toBe(false);
    expect(validateToolInput(schemaTool, { path: "x".repeat(200_001) }).valid).toBe(false);
  });

  test("rejects prototype-pollution keys even when JSON parsing created an own property", () => {
    const hostile = JSON.parse('{"path":"a","__proto__":{"polluted":true}}');
    expect(validateToolInput(schemaTool, hostile).valid).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  test("queryLoop refuses an invalid tool_use before calling tool.execute", async () => {
    let executed = false;
    const tool: ToolDefinition = {
      name: "Guarded",
      description: "guarded",
      permissionLevel: PermissionLevel.READ_ONLY,
      inputSchema: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
      async execute() {
        executed = true;
        return { content: "should not run", isError: false };
      },
    };
    const provider = new StubProvider([
      response([
        { type: "tool_use", id: "u1", name: "Guarded", input: { path: { $ne: null } } },
      ], "tool_use"),
      response([{ type: "text", text: "done" }], "end_turn"),
    ]);
    const engine = new QueryEngine(provider, { maxRetries: 0, initialDelayMs: 0, backoffMultiplier: 1 });
    const events: AgentEvent[] = [];
    for await (const e of queryLoop("go", { engine, systemPrompt: "test", maxTurns: 3, tools: [tool], permissionLevel: PermissionLevel.STANDARD })) {
      events.push(e);
    }
    expect(executed).toBe(false);
    const failure = events.find((e) => e.type === "tool_result" && e.isError);
    expect(failure?.type).toBe("tool_result");
    expect(failure && failure.result).toMatch(/Invalid tool input/);
  });
});

describe("F-05: IDs cannot be used as path traversal", () => {
  test("isSafeId rejects separators, dot segments and dotfiles", () => {
    expect(isSafeId("session-123")).toBe(true);
    for (const bad of ["", "../etc", "..", ".hidden", "a/b", "a\\b", "a..b", "a\0b", "/tmp/x"]) {
      expect(isSafeId(bad)).toBe(false);
    }
    expect(() => assertSafeId("../../tmp/evil", "session id")).toThrow(/Invalid session id/);
  });

  test("SessionManager and MemoryStore refuse traversal IDs", async () => {
    const home = await mkdtemp(join(tmpdir(), "cowork-ids-"));
    const prev = process.env.COWORK_HOME;
    process.env.COWORK_HOME = home;
    try {
      const manager = new SessionManager("/tmp/project");
      await expect(manager.get("../../../../tmp/cowork-redteam-session")).rejects.toThrow(/Invalid session id/);
      // pathFor throws synchronously; assert it directly.
      expect(() => new MemoryStore(join(home, "memory")).pathFor("user", "../../../../tmp/victim")).toThrow(/Invalid memory id/);
    } finally {
      if (prev === undefined) delete process.env.COWORK_HOME;
      else process.env.COWORK_HOME = prev;
      await rm(home, { recursive: true, force: true });
    }
  });

  test("guardPath contains nested entrypoints from an untrusted registry", async () => {
    const root = await mkdtemp(join(tmpdir(), "cowork-plugins-"));
    try {
      const ok = await guardPath(root, "plugin/index.js");
      expect(ok.error).toBeUndefined();
      const escaped = await guardPath(root, "../../evil.js");
      expect(escaped.error).toMatch(/escapes the project root/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("F-04: state files and directories are private", () => {
  let home: string;
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "cowork-modes-"));
  });
  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  test("writePrivateFile / appendPrivateFile / ensurePrivateDir use 0600 / 0700", async () => {
    const dir = join(home, "nested", "state");
    await ensurePrivateDir(dir);
    expect((await stat(dir)).mode & 0o777).toBe(0o700);

    const file = join(dir, "history.ndjson");
    await writePrivateFile(file, "first\n");
    await appendPrivateFile(file, "second\n");
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect(await Bun.file(file).text()).toBe("first\nsecond\n");
  });

  test("an existing world-readable file is tightened on the next write", async () => {
    const file = join(home, "settings.json");
    await writePrivateFile(file, "{}");
    const { chmod } = await import("node:fs/promises");
    await chmod(file, 0o644);
    expect((await stat(file)).mode & 0o777).toBe(0o644);
    await writePrivateFile(file, "{\"a\":1}");
    expect((await stat(file)).mode & 0o777).toBe(0o600);
  });
});
