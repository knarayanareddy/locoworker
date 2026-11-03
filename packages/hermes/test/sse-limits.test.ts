import { afterAll, describe, expect, test } from "bun:test";
import { HermesServer } from "../src/server/HermesServer.js";
import { PermissionLevel, type ToolDefinition } from "@cowork/core";

const TOKEN = "test-hermes-token-1234567890";
const LIMITS = {
  maxSseConnections: 2,
  sseIdleMs: 200,
  sseHeartbeatMs: 50,
  maxRequestBytes: 512,
};

const tools: ToolDefinition[] = [
  {
    name: "Read",
    description: "read",
    permissionLevel: PermissionLevel.READ_ONLY,
    inputSchema: { type: "object", properties: {} },
    async execute() { return { content: "file contents", isError: false }; },
  },
];

const server = new HermesServer(
  {
    transport: "sse",
    port: 0,
    hostname: "127.0.0.1",
    authToken: TOKEN,
    limits: LIMITS,
  },
  tools,
);

server.startSse();

const base = () => `http://127.0.0.1:${server.boundPort}`;
const auth = { Authorization: `Bearer ${TOKEN}` };

afterAll(() => server.stop());

describe("R-11: Hermes SSE connections and request bodies are bounded", () => {
  test("the (N+1)th SSE connection is refused with 503 + Retry-After", async () => {
    const readers: ReadableStreamDefaultReader<Uint8Array>[] = [];
    const statuses: number[] = [];

    for (let i = 0; i < 3; i += 1) {
      const res = await fetch(`${base()}/sse`, { headers: auth });
      statuses.push(res.status);
      if (res.ok && res.body) {
        const reader = res.body.getReader();
        await reader.read(); // consume the "ready" event to keep the stream open
        readers.push(reader);
      }
    }

    expect(statuses).toEqual([200, 200, 503]);
    expect(server.activeSseConnections).toBe(2);
    expect(readers).toHaveLength(2);

    const rejected = await fetch(`${base()}/sse`, { headers: auth });
    expect(rejected.headers.get("retry-after")).toBe("5");
  });

  test("SSE slots are released after the idle lifetime", async () => {
    // The two connections above have a 200ms absolute lifetime.
    await Bun.sleep(350);
    expect(server.activeSseConnections).toBe(0);
    const res = await fetch(`${base()}/sse`, { headers: auth });
    expect(res.status).toBe(200);
    await res.body?.cancel();
  });

  test("an oversized HTTP JSON-RPC body is rejected before parsing", async () => {
    const res = await fetch(`${base()}/message`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: "x".repeat(2_000) }),
    });
    expect(res.status).toBe(413);
  });

  test("a normal HTTP JSON-RPC body still works", async () => {
    const res = await fetch(`${base()}/message`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "initialize" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: number; result: { protocolVersion: string } };
    expect(body.id).toBe(7);
    expect(body.result.protocolVersion).toBe("2024-11-05");
  });
});
