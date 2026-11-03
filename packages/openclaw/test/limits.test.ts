import { afterAll, describe, expect, test } from "bun:test";
import { GatewayServer } from "../src/gateway/GatewayServer.js";
import { CoworkGateway } from "../src/CoworkGateway.js";
import type { GatewayConfig } from "../src/gateway/types.js";

const PRIMARY = "primary-gateway-token-1234567890";
const TOKENS = [
  "sender-token-aaaaaaaaaaaaaa",
  "sender-token-bbbbbbbbbbbbbb",
  "sender-token-cccccccccccccc",
  "sender-token-dddddddddddddd",
  "sender-token-eeeeeeeeeeeeee",
];

const senderTokens: Record<string, string> = Object.fromEntries(
  TOKENS.map((token, i) => [token, `sender-${i}`]),
);

const servers: GatewayServer[] = [];

function makeServer(overrides: Partial<GatewayConfig> = {}): GatewayServer {
  const gw = new GatewayServer({
    port: 0,
    hostname: "127.0.0.1",
    rateLimitPerMinute: 100,
    authToken: PRIMARY,
    senderTokens,
    limits: {
      maxOutboxPrincipals: 3,
      maxStateBytes: 100_000,
      maxRequestBytes: 256,
    },
    ...overrides,
  });
  servers.push(gw);
  return gw;
}

const url = (gw: GatewayServer, path: string) => `http://127.0.0.1:${gw.boundPort}${path}`;

afterAll(() => {
  for (const gw of servers) gw.stop();
});

describe("R-11: gateway state and request bodies are bounded", () => {
  test("outbox principals never exceed the configured cap", async () => {
    const gw = makeServer();
    let handled = 0;
    gw.onMessage(async () => {
      handled += 1;
      return "ok";
    });
    gw.start();

    for (const token of TOKENS) {
      const res = await fetch(url(gw, "/message"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: "hello" }),
      });
      expect(res.status).toBe(200);
    }

    expect(handled).toBe(TOKENS.length);
    expect(gw.resourceStats.size).toBe(3);
    expect(gw.resourceStats.evictions.entries).toBe(2);
    expect(gw.resourceStats.bytes).toBeLessThanOrEqual(100_000);
  });

  test("an oversized request body is rejected with 413 before the handler runs", async () => {
    const gw = makeServer();
    let handled = 0;
    gw.onMessage(async () => {
      handled += 1;
      return "should not run";
    });
    gw.start();

    const res = await fetch(url(gw, "/message"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKENS[0]}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: "x".repeat(2_000) }),
    });
    expect(res.status).toBe(413);
    expect(handled).toBe(0);
  });

  test("a normal request still succeeds with the byte cap in place", async () => {
    const gw = makeServer();
    gw.onMessage(async (msg) => `echo:${msg.text}`);
    gw.start();

    const res = await fetch(url(gw, "/message"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKENS[1]}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: "hello" }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { response: string }).response).toBe("echo:hello");
  });

  test("CoworkGateway wires the trusted session cap into its bounded map", () => {
    const gw = new CoworkGateway({
      projectRoot: "/tmp",
      port: 0,
      limits: { maxSessions: 2, maxStateBytes: 10_000 },
    });
    expect(gw.resourceStats.maxEntries).toBe(2);
    expect(gw.resourceStats.size).toBe(0);
    expect(gw.resourceStats.maxBytes).toBe(10_000);
  });
});
