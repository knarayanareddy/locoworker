/**
 * Regression tests for the 2026-11-03 P0 network / filesystem / auth refresh
 * (R-02, R-03, R-04, R-06, R-07). All cases were reproduced against 43584eb.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import {
  chmod, mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NetworkSandbox } from "../src/sandbox/NetworkSandbox.js";
import { guardedFetch } from "../src/network/guardedFetch.js";
import { HttpGuard, WebhookReplayCache, verifyWebhookSignature } from "../src/network/HttpGuard.js";
import { filterEnv } from "../src/env/SensitiveEnv.js";
import { ensurePrivateDir, writePrivateFile } from "../src/audit/secureFile.js";

const tmpDirs: string[] = [];
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});
const temp = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "cowork-p0-"));
  tmpDirs.push(dir);
  return dir;
};

describe("R-03: full IANA special-use IPv6 / IPv4 classification", () => {
  test("every bypass prefix from the review is denied", () => {
    const sandbox = new NetworkSandbox({ enabled: false, allowlist: [] });
    const urls = [
      "http://127.0.0.1/", "http://localhost/", "http://169.254.169.254/",
      "http://[::ffff:127.0.0.1]/", "http://127.1/", "http://0x7f000001/",
      "http://foo.127.0.0.1.nip.io/", "http://[::1]/",
      "http://[64:ff9b::7f00:1]/", "http://[2002:7f00:1::]/", "http://192.88.99.1/",
      "http://[::ffff:0:127.0.0.1]/", "http://[2001:0:4136:e378:8000:63bf:3fff:fdd2]/",
      "http://[2001:10::1]/", "http://[100::1]/", "http://[2001:2::1]/",
      "http://[64:ff9b:1::7f00:1]/", "http://[2002:0a00:0001::]/",
    ];
    for (const url of urls) expect(sandbox.isAllowed(url)).toBe(false);
    expect(sandbox.isAllowed("https://example.com/")).toBe(true);
  });

  test("allowlist enforcement is enabled by default", () => {
    expect(NetworkSandbox.default({}).getConfig().enabled).toBe(true);
    expect(NetworkSandbox.default({ COWORK_SANDBOX_ENABLED: "false" } as NodeJS.ProcessEnv).getConfig().enabled).toBe(false);
  });
});

describe("R-02: guardedFetch pins DNS and blocks private targets", () => {
  test("loopback is blocked by default and allowed only via allowPrivate", async () => {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => Response.json({ ok: true }),
    });
    try {
      const url = `http://127.0.0.1:${server.port}/json`;
      await expect(guardedFetch(url, {}, { context: "test" })).rejects.toThrow(/not permitted/);
      const response = await guardedFetch(url, {}, { allowPrivate: true, context: "test" });
      expect(response.status).toBe(200);
      expect((await response.json() as { ok: boolean }).ok).toBe(true);
    } finally {
      server.stop();
    }
  });

  test("FormData bodies are preserved through the pinned connection", async () => {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(req) {
        const form = await req.formData();
        return Response.json({ model: String(form.get("model")), hasFile: form.has("file") });
      },
    });
    try {
      const form = new FormData();
      form.append("model", "whisper-1");
      form.append("file", new Blob(["audio"]), "a.wav");
      const response = await guardedFetch(
        `http://127.0.0.1:${server.port}/form`,
        { method: "POST", body: form },
        { allowPrivate: true, context: "test" },
      );
      expect(await response.json()).toEqual({ model: "whisper-1", hasFile: true });
    } finally {
      server.stop();
    }
  });
});

describe("R-04: private state writers refuse symlinks", () => {
  test("a symlinked state file cannot be overwritten or chmod'ed", async () => {
    const home = await temp();
    const stateDir = join(home, "state");
    await ensurePrivateDir(stateDir);
    const victim = join(home, "victim.txt");
    await writeFile(victim, "original", { mode: 0o644 });
    await chmod(victim, 0o644);
    const link = join(stateDir, "session.json");
    await symlink(victim, link);

    await expect(writePrivateFile(link, "OVERWRITTEN")).rejects.toThrow(/symlink/i);
    expect(await readFile(victim, "utf8")).toBe("original");
    expect((await stat(victim)).mode & 0o777).toBe(0o644);
  });

  test("a symlinked state directory cannot be used as a write target", async () => {
    const home = await temp();
    const outside = join(home, "outside");
    await mkdir(outside);
    const linked = join(home, "wiki");
    await symlink(outside, linked);

    await expect(writePrivateFile(join(linked, "page.json"), "{}")).rejects.toThrow(/symlink/i);
    expect(await readdir(outside)).toEqual([]);
  });
});

describe("R-06: child process env is an allowlist", () => {
  test("code-execution hooks and credentials are dropped", () => {
    const filtered = filterEnv({
      PATH: "/usr/bin", HOME: "/home/user", LANG: "en_US.UTF-8",
      NODE_OPTIONS: "--require /tmp/evil.js", LD_PRELOAD: "/tmp/evil.so",
      BUN_OPTIONS: "-r /tmp/evil.js", DATABASE_URL: "postgres://u:p@h/db",
      PGPASSWORD: "hunter2", STRIPE_KEY: "sk_live_x", SSH_AUTH_SOCK: "/tmp/agent.sock",
      ANTHROPIC_API_KEY: "sk-ant-x",
    });
    expect(filtered.PATH).toBe("/usr/bin");
    expect(filtered.HOME).toBe("/home/user");
    expect(filtered.LANG).toBe("en_US.UTF-8");
    for (const key of [
      "NODE_OPTIONS", "LD_PRELOAD", "BUN_OPTIONS", "DATABASE_URL",
      "PGPASSWORD", "STRIPE_KEY", "SSH_AUTH_SOCK", "ANTHROPIC_API_KEY",
    ]) expect(filtered[key]).toBeUndefined();
  });
});

describe("R-07: auth backoff, Host validation and webhook replay", () => {
  test("repeated failed tokens are throttled with Retry-After", () => {
    const guard = new HttpGuard({
      serviceName: "test", tokenEnvVar: "T", token: "a-very-long-test-token", env: {},
    });
    const bad = () => new Request("http://127.0.0.1/api", {
      headers: { Authorization: "Bearer wrong-token-value" },
    });
    expect(guard.authorize(bad())?.status).toBe(401);
    const second = guard.authorize(bad());
    expect(second?.status).toBe(429);
    expect(Number(second?.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  test("a crafted Host header is rejected on state-changing requests", () => {
    const guard = new HttpGuard({
      serviceName: "test", tokenEnvVar: "T", token: "a-very-long-test-token", env: {},
    });
    const post = new Request("http://127.0.0.1/api/x", {
      method: "POST",
      headers: {
        Authorization: "Bearer a-very-long-test-token",
        Host: "evil.example",
        Origin: "http://evil.example",
      },
    });
    expect(guard.authorize(post)?.status).toBe(403);
  });

  test("webhook bodies cannot be replayed; timestamp+nonce HMAC is enforced", () => {
    const secret = "webhook-secret";
    const body = '{"text":"hello"}';
    const legacy = createHmac("sha256", secret).update(body, "utf8").digest("hex");
    const replay = new WebhookReplayCache();
    expect(verifyWebhookSignature(body, `sha256=${legacy}`, secret, { replay })).toBe(true);
    expect(verifyWebhookSignature(body, `sha256=${legacy}`, secret, { replay })).toBe(false);

    const timestamp = String(Date.now());
    const nonce = "nonce-1";
    const modern = createHmac("sha256", secret)
      .update(`${timestamp}.${nonce}.${body}`, "utf8")
      .digest("hex");
    expect(verifyWebhookSignature(body, `sha256=${modern}`, secret, { timestamp, nonce, replay })).toBe(true);
    expect(verifyWebhookSignature(body, `sha256=${modern}`, secret, { timestamp, nonce, replay })).toBe(false);
    expect(verifyWebhookSignature(body, `sha256=${legacy}`, secret, {
      timestamp: String(Date.now() - 10 * 60_000), nonce: "nonce-2", replay,
    })).toBe(false);
  });
});
