import { describe, expect, test } from "bun:test";
import {
  queryLoop,
  QueryEngine,
  DEFAULT_TOOLS,
  PermissionLevel,
  setDefaultAgentPolicy,
  type CallOptions,
  type Provider,
  type ModelResponse,
  type AgentEvent,
} from "../src/index.js";
import type { ToolDefinition } from "../src/Tool.js";

class StubProvider implements Provider {
  readonly name = "ollama" as const;
  readonly model = "stub";
  readonly calls: CallOptions[] = [];
  private index = 0;
  constructor(private responses: ModelResponse[]) {}
  async call(options: CallOptions): Promise<ModelResponse> {
    this.calls.push(options);
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

async function collect(input: string, provider: Provider, config: Partial<Parameters<typeof queryLoop>[1]>): Promise<AgentEvent[]> {
  const engine = new QueryEngine(provider, { maxRetries: 0, initialDelayMs: 0, backoffMultiplier: 1 });
  const events: AgentEvent[] = [];
  for await (const event of queryLoop(input, { engine, systemPrompt: "test", maxTurns: 5, ...config })) {
    events.push(event);
  }
  return events;
}

describe("queryLoop", () => {
  test("complete.text is the final assistant turn only, not intermediate chatter", async () => {
    const echo: ToolDefinition = {
      name: "Echo", description: "echo", permissionLevel: PermissionLevel.READ_ONLY,
      inputSchema: { type: "object", properties: {} },
      async execute() { return { content: "echoed", isError: false }; },
    };
    const provider = new StubProvider([
      response([
        { type: "text", text: "Let me check that. " },
        { type: "tool_use", id: "u1", name: "Echo", input: {} },
      ], "tool_use"),
      response([{ type: "text", text: "final answer" }], "end_turn"),
    ]);
    const events = await collect("do it", provider, { tools: [echo], permissionLevel: PermissionLevel.STANDARD });
    const complete = events.find((e) => e.type === "complete");
    expect(complete?.type).toBe("complete");
    expect(complete && complete.text).toBe("final answer");
    expect(complete && complete.text).not.toContain("Let me check");
    expect(events.filter((e) => e.type === "text").length).toBe(2);
  });

  test("supplied history is authoritative and must include the current message", async () => {
    const provider = new StubProvider([response([{ type: "text", text: "ok" }], "end_turn")]);
    await collect("ignored input", provider, {
      history: [{ role: "user", content: "from history" }],
    });
    const first = provider.calls[0];
    expect(first).toBeDefined();
    expect(JSON.stringify(first!.messages)).toContain("from history");
    expect(JSON.stringify(first!.messages)).not.toContain("ignored input");
  });

  test("policy is inherited by the loop and by ambient nested loops", async () => {
    const writeTool = DEFAULT_TOOLS.find((t) => t.name === "Write")!;
    const toolUse = response([
      { type: "tool_use", id: "u2", name: "Write", input: { path: "x.txt", content: "x" } },
    ], "tool_use");
    const finish = response([{ type: "text", text: "done" }], "end_turn");

    const explicit = await collect("write", new StubProvider([toolUse, finish]), {
      tools: [writeTool],
      policy: { permissionLevel: PermissionLevel.READ_ONLY },
    });
    expect(explicit.some((e) => e.type === "permission_denied")).toBe(true);

    setDefaultAgentPolicy({ permissionLevel: PermissionLevel.READ_ONLY });
    try {
      const ambient = await collect("write", new StubProvider([toolUse, finish]), { tools: [writeTool] });
      expect(ambient.some((e) => e.type === "permission_denied")).toBe(true);
    } finally {
      setDefaultAgentPolicy(undefined);
    }
  });
});
