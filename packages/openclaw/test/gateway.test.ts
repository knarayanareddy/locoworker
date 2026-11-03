import { afterAll, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { GatewayServer } from "../src/gateway/GatewayServer.js";
import type { InboundMessage } from "../src/gateway/types.js";

const TOKEN = "test-gateway-token-1234567890";
const WEBHOOK_SECRET = "test-webhook-secret-1234567890";

const servers: GatewayServer[] = [];

function makeServer(): GatewayServer {
  const gw = new GatewayServer({
    port: 0,
    hostname: "127.0.0.1",
    rateLimitPerMinute: 20,
    authToken: TOKEN,
    webhookSecret: WEBHOOK_SECRET,
  });
  servers.push(gw);
  return gw;
}

function url(gw: GatewayServer, path: string): string {
  return `http://127.0.0.1:${gw.boundPort}${path}`;
}

const auth = { Authorization: `Bearer ${TOKEN}` };

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

  test("outbox is scoped per sender and requires an explicit sender", async () => {
    const gw = makeServer();
    gw.onMessage(async (msg) => `reply-for-${msg.from}`);
    gw.start();

    await post(gw, "/message", { from: "alice", text: "one" });

    const mine = await fetch(url(gw, "/outbox?from=alice"), { headers: auth });
    expect(mine.status).toBe(200);
    const messages = (await mine.json()) as Array<{ to: string; text: string }>;
    expect(messages).toHaveLength(1);
    expect(messages[0].to).toBe("alice");
    expect(messages[0].text).toBe("reply-for-alice");

    const other = await fetch(url(gw, "/outbox?from=bob"), { headers: auth });
    expect(await other.json()).toEqual([]);

    const missing = await fetch(url(gw, "/outbox"), { headers: auth });
    expect(missing.status).toBe(400);
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
  });

  test("sender allowlist is enforced before the handler runs", async () => {
    const gw = new GatewayServer({
      port: 0,
      hostname: "127.0.0.1",
      rateLimitPerMinute: 20,
      authToken: TOKEN,
      allowedSenders: ["alice"],
    });
    servers.push(gw);
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
