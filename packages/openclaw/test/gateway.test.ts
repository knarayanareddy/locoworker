import { afterAll, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { GatewayServer } from "../src/gateway/GatewayServer.js";
import type { GatewayConfig, InboundMessage } from "../src/gateway/types.js";

const TOKEN = "test-gateway-token-1234567890";
const TOKEN2 = "second-gateway-token-0987654321";
const WEBHOOK_SECRET = "test-webhook-secret-1234567890";

const servers: GatewayServer[] = [];

function makeServer(overrides: Partial<GatewayConfig> = {}): GatewayServer {
  const gw = new GatewayServer({
    port: 0,
    hostname: "127.0.0.1",
    rateLimitPerMinute: 20,
    authToken: TOKEN,
    webhookSecret: WEBHOOK_SECRET,
    // One token == one identity. Without this, identity is a hash of the token.
    senderTokens: { [TOKEN]: "alice" },
    ...overrides,
  });
  servers.push(gw);
  return gw;
}

function url(gw: GatewayServer, path: string): string {
  return `http://127.0.0.1:${gw.boundPort}${path}`;
}

const auth = { Authorization: `Bearer ${TOKEN}` };
const auth2 = { Authorization: `Bearer ${TOKEN2}` };

async function post(gw: GatewayServer, path: string, body: unknown, headers: Record<string, string> = auth) {
  return fetch(url(gw, path), {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterAll(() => {
  for (const gw of servers) gw.stop();
});

describe("GatewayServer event handling", () => {
  test("registered handler receives the message and its reply is returned inline", async () => {
    const gw = makeServer();
    const received: InboundMessage[] = [];
    gw.onMessage(async (msg) => {
      received.push(msg);
      return `echo:${msg.text}`;
    });
    gw.start();

    const res = await post(gw, "/message", { from: "alice", text: "hello" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; response: string };
    expect(body.response).toBe("echo:hello");
    expect(typeof body.id).toBe("string");
    expect(received).toHaveLength(1);
    expect(received[0].channel).toBe("http");
    expect(received[0].from).toBe("alice");
    expect(received[0].text).toBe("hello");
  });

  test("identity comes from the token, not from a client-supplied 'from'", async () => {
    const gw = makeServer();
    const received: InboundMessage[] = [];
    gw.onMessage(async (msg) => {
      received.push(msg);
      return "ok";
    });
    gw.start();

    // Omitting `from` still yields the token's identity.
    const implicit = await post(gw, "/message", { text: "no from field" });
    expect(implicit.status).toBe(200);
    expect(received[0].from).toBe("alice");

    // Claiming somebody else's identity is rejected before the handler runs.
    const spoof = await post(gw, "/message", { from: "bob", text: "I am bob" });
    expect(spoof.status).toBe(403);
    expect(received).toHaveLength(1);
  });

  test("outbox is scoped to the token identity (no IDOR)", async () => {
    const gw = makeServer({
      senderTokens: { [TOKEN]: "alice", [TOKEN2]: "bob" },
    });
    gw.onMessage(async (msg) => `reply-for-${msg.from}`);
    gw.start();

    await post(gw, "/message", { text: "one" });

    // No `from` parameter is needed; the token determines the outbox.
    const mine = await fetch(url(gw, "/outbox"), { headers: auth });
    expect(mine.status).toBe(200);
    const messages = (await mine.json()) as Array<{ to: string; text: string }>;
    expect(messages).toHaveLength(1);
    expect(messages[0].to).toBe("alice");
    expect(messages[0].text).toBe("reply-for-alice");

    const explicit = await fetch(url(gw, "/outbox?from=alice"), { headers: auth });
    expect(explicit.status).toBe(200);
    expect((await explicit.json()) as unknown[]).toHaveLength(1);

    // A different token has its own (empty) outbox.
    const bobs = await fetch(url(gw, "/outbox"), { headers: auth2 });
    expect(bobs.status).toBe(200);
    expect(await bobs.json()).toEqual([]);

    // A token cannot ask for someone else's outbox by name.
    const stolen = await fetch(url(gw, "/outbox?from=alice"), { headers: auth2 });
    expect(stolen.status).toBe(403);
    const wrongName = await fetch(url(gw, "/outbox?from=bob"), { headers: auth });
    expect(wrongName.status).toBe(403);
  });

  test("rate limiting is keyed on the token, so rotating 'from' cannot bypass it", async () => {
    const gw = makeServer({
      rateLimitPerMinute: 2,
      senderTokens: { [TOKEN]: "alice", [TOKEN2]: "bob" },
    });
    gw.onMessage(async () => "ok");
    gw.start();

    expect((await post(gw, "/message", { from: "alice", text: "1" })).status).toBe(200);
    expect((await post(gw, "/message", { from: "alice", text: "2" })).status).toBe(200);
    // Rotating the claimed sender does not create a new bucket.
    expect((await post(gw, "/message", { from: "mallory", text: "3" })).status).toBe(403);
    expect((await post(gw, "/message", { text: "4" })).status).toBe(429);

    // A genuinely different token has its own bucket.
    expect((await post(gw, "/message", { from: "bob", text: "b1" }, auth2)).status).toBe(200);
  });

  test("unauthenticated and cross-origin state-changing requests are rejected", async () => {
    const gw = makeServer();
    gw.onMessage(async () => "should not run");
    gw.start();

    const noAuth = await fetch(url(gw, "/health"));
    expect(noAuth.status).toBe(200);

    const unauth = await post(gw, "/message", { from: "alice", text: "hello" }, {});
    expect(unauth.status).toBe(401);

    const crossOrigin = await post(gw, "/message", { from: "alice", text: "hello" }, {
      ...auth,
      Origin: "https://evil.example",
    });
    expect(crossOrigin.status).toBe(403);
  });

  test("webhooks require a valid HMAC signature over the raw body", async () => {
    const gw = makeServer();
    const received: InboundMessage[] = [];
    gw.onMessage(async (msg) => {
      received.push(msg);
      return "webhook-ok";
    });
    gw.start();

    const raw = JSON.stringify({ from: "hook", text: "ping" });
    const bad = await fetch(url(gw, "/webhook"), {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json", "x-cowork-signature": "sha256=" + "0".repeat(64) },
      body: raw,
    });
    expect(bad.status).toBe(401);

    const signature = createHmac("sha256", WEBHOOK_SECRET).update(raw, "utf8").digest("hex");
    const good = await fetch(url(gw, "/webhook"), {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json", "x-cowork-signature": `sha256=${signature}` },
      body: raw,
    });
    expect(good.status).toBe(200);
    expect(((await good.json()) as { response: string }).response).toBe("webhook-ok");
    expect(received[0].channel).toBe("webhook");
    // The signed payload's `from` is metadata, not an authenticated identity.
    expect(received[0].from).toBe("alice");
    expect(received[0].metadata?.source).toBe("hook");
  });

  test("sender allowlist is enforced before the handler runs", async () => {
    const gw = makeServer({ allowedSenders: ["alice"] });
    const received: InboundMessage[] = [];
    gw.onMessage(async (msg) => {
      received.push(msg);
      return "ok";
    });
    gw.start();

    const denied = await post(gw, "/message", { from: "mallory", text: "hello" });
    expect(denied.status).toBe(403);
    expect(received).toHaveLength(0);

    const allowed = await post(gw, "/message", { from: "alice", text: "hello" });
    expect(allowed.status).toBe(200);
    expect(received).toHaveLength(1);
  });
});
