import { afterAll, describe, expect, test } from "bun:test";
import { McpStdioClient } from "../src/mcp/McpStdioClient.js";

/**
 * R-11 regression: a silent or chatty MCP stdio server used to be able to grow
 * `pending` forever (no request timeout) and `buffer` forever (a partial line
 * with no newline). All child processes here are harmless local scripts.
 */
const clients: McpStdioClient[] = [];

function makeClient(
  script: string,
  limits: { maxLineBytes?: number; maxPending?: number; requestTimeoutMs?: number } = {},
): McpStdioClient {
  const client = new McpStdioClient(
    {
      name: "test-server",
      transport: "stdio",
      command: process.execPath,
      args: ["-e", script],
    },
    limits,
    // R-13: even tests must use the executable allowlist.
    { allowedCommands: [process.execPath], cwd: process.cwd() },
  );
  clients.push(client);
  return client;
}

afterAll(async () => {
  for (const client of clients) await client.disconnect();
});

describe("R-11 / R-13: MCP stdio client bounds", () => {
  test("a silent server cannot leave a request pending forever", async () => {
    const client = makeClient("setTimeout(() => {}, 30000)", {
      requestTimeoutMs: 80,
      maxPending: 8,
    });
    await expect(client.connect()).rejects.toThrow(/timed out/i);
    expect(client.stats().pending).toBe(0);
  });

  test("a partial stdout line above the byte cap is dropped and fails pending requests", async () => {
    const client = makeClient(
      "setTimeout(() => process.stdout.write('x'.repeat(5000)), 40)",
      { maxLineBytes: 512, requestTimeoutMs: 3_000, maxPending: 8 },
    );
    await expect(client.connect()).rejects.toThrow(/exceeds/i);
    expect(client.stats().bufferBytes).toBe(0);
    expect(client.stats().droppedLines).toBeGreaterThanOrEqual(1);
    expect(client.stats().pending).toBe(0);
  });

  test("the pending-request cap refuses new requests instead of growing", async () => {
    const client = makeClient("setTimeout(() => {}, 30000)", {
      maxPending: 1,
      requestTimeoutMs: 60,
    });
    const request = (client as unknown as {
      request: (method: string, params: unknown) => Promise<unknown>;
    }).request.bind(client);

    const first = request("first", {});
    await expect(request("second", {})).rejects.toThrow(/Too many in-flight/i);
    await expect(first).rejects.toThrow(/timed out/i);
    expect(client.stats().pending).toBe(0);
  });
});
