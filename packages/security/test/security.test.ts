import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { createHmac } from "node:crypto";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TOTPAuth, base32Encode } from "../src/TOTP.js";
import {
  HttpGuard,
  constantTimeEquals,
  isLoopbackHost,
  verifyWebhookSignature,
} from "../src/network/HttpGuard.js";
import { scrubSecrets, safeMetadata } from "../src/scrub/SecretScrubber.js";
import { filterEnv, isSensitiveEnvName, displayEnvValue } from "../src/env/SensitiveEnv.js";
import { NetworkSandbox } from "../src/sandbox/NetworkSandbox.js";
import { AuditLog } from "../src/audit/AuditLog.js";

const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890", "ascii"));

describe("TOTP (RFC 6238)", () => {
  test("matches the published SHA-1 / 8-digit test vectors", () => {
    const totp = new TOTPAuth(RFC_SECRET, { digits: 8, window: 0 });
    expect(totp.generate(59_000)).toBe("94287082");
    expect(totp.generate(1_111_111_109_000)).toBe("07081804");
    expect(totp.generate(1_111_111_111_000)).toBe("14050471");
    expect(totp.generate(1_234_567_890_000)).toBe("89005924");
    expect(totp.generate(2_000_000_000_000)).toBe("69279037");
  });

  test("verifies with clock skew but rejects bad codes", () => {
    const totp = new TOTPAuth(RFC_SECRET);
    const at = 1_700_000_000_000;
    expect(totp.verify(totp.generate(at), at)).toBe(true);
    expect(totp.verify("000000", at)).toBe(false);
    expect(totp.verify("abc123", at)).toBe(false);
  });

  test("has no default secret", () => {
    expect(() => new TOTPAuth()).toThrow(/secret is required/);
    expect(() => new TOTPAuth("not base32!")).toThrow();
  });
});

describe("HttpGuard", () => {
  test("binds loopback and generates a non-guessable token", () => {
    const guard = new HttpGuard({ serviceName: "test", tokenEnvVar: "TEST_TOKEN", env: {} });
    expect(guard.hostname).toBe("127.0.0.1");
    expect(guard.tokenSource).toBe("ephemeral");
    expect(guard.token.length).toBeGreaterThanOrEqual(32);
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("0.0.0.0")).toBe(false);
  });

  test("refuses a non-loopback bind without a token", () => {
    expect(() => new HttpGuard({
      serviceName: "test", tokenEnvVar: "TEST_TOKEN", hostname: "0.0.0.0", env: {},
    })).toThrow(/refusing to bind/);
  });

  test("rejects missing, wrong and short tokens; accepts the right one", () => {
    const guard = new HttpGuard({
      serviceName: "test", tokenEnvVar: "TEST_TOKEN", token: "a-very-long-test-token", env: {},
    });
    const get = () => new Request("http://127.0.0.1/api/status", { method: "GET" });
    expect(guard.authorize(get())?.status).toBe(401);
    expect(guard.authorize(new Request("http://127.0.0.1/api/status", {
      headers: { Authorization: "Bearer wrong-token-value" },
    }))?.status).toBe(401);
    expect(guard.authorize(new Request("http://127.0.0.1/api/status", {
      headers: { Authorization: "Bearer a-very-long-test-token" },
    }))).toBeNull();
    expect(() => new HttpGuard({ serviceName: "t", tokenEnvVar: "T", token: "short", env: {} }))
      .toThrow(/at least 16 characters/);
  });

  test("rejects cross-origin state-changing requests", () => {
    const guard = new HttpGuard({ serviceName: "test", tokenEnvVar: "T", token: "a-very-long-test-token", env: {} });
    const post = (headers: Record<string, string>) => new Request("http://127.0.0.1/api/x", {
      method: "POST",
      headers: { Authorization: "Bearer a-very-long-test-token", ...headers },
    });
    expect(guard.authorize(post({ Origin: "https://evil.example" }))?.status).toBe(403);
    expect(guard.authorize(post({ "Sec-Fetch-Site": "cross-site" }))?.status).toBe(403);
    expect(guard.authorize(post({ Origin: "http://127.0.0.1" }))).toBeNull();
  });

  test("constantTimeEquals does not leak through early mismatch", () => {
    expect(constantTimeEquals("abc", "abc")).toBe(true);
    expect(constantTimeEquals("abc", "abd")).toBe(false);
    expect(constantTimeEquals("abc", "abcd")).toBe(false);
  });
});

describe("webhook signatures", () => {
  test("verifies HMAC-SHA256 over the exact body", () => {
    const secret = "webhook-secret";
    const body = '{"text":"hello"}';
    const sig = "sha256=" + createHmac("sha256", secret).update(body, "utf8").digest("hex");
    expect(verifyWebhookSignature(body, sig, secret)).toBe(true);
    expect(verifyWebhookSignature(body + " ", sig, secret)).toBe(false);
    expect(verifyWebhookSignature(body, null, secret)).toBe(false);
    expect(verifyWebhookSignature(body, "sha1=deadbeef", secret)).toBe(false);
  });
});

describe("secret scrubbing", () => {
  test("redacts bare Anthropic keys and private key blocks", () => {
    const text = "key sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ123456 and sk-proj-ABCDEFGHIJKLMNOPQRSTUVWX";
    const scrubbed = scrubSecrets(text);
    expect(scrubbed).not.toContain("sk-ant-api03-");
    expect(scrubbed).not.toContain("sk-proj-");
    expect(scrubbed).toContain("[ANTHROPIC_KEY]");
    expect(scrubSecrets("-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----"))
      .toBe("[PRIVATE_KEY]");
  });

  test("scrubs nested arrays and redacts sensitive keys", () => {
    const safe = safeMetadata({
      apiKey: "should-not-appear",
      nested: ["token=abcdefgh12345678", { password: "hunter2" }],
      normal: "hello",
    }) as Record<string, unknown>;
    expect(JSON.stringify(safe)).not.toContain("should-not-appear");
    expect(JSON.stringify(safe)).not.toContain("abcdefgh12345678");
    expect((safe as any).normal).toBe("hello");
  });
});

describe("env filtering", () => {
  test("strips credentials but keeps ordinary variables", () => {
    expect(isSensitiveEnvName("ANTHROPIC_API_KEY")).toBe(true);
    expect(isSensitiveEnvName("COWORK_GATEWAY_AUTH_TOKEN")).toBe(true);
    expect(isSensitiveEnvName("PATH")).toBe(false);
    const filtered = filterEnv({
      PATH: "/usr/bin",
      ANTHROPIC_API_KEY: "secret",
      COWORK_HERMES_AUTH_TOKEN: "secret",
      HOME: "/home/user",
    });
    expect(filtered.PATH).toBe("/usr/bin");
    expect(filtered.ANTHROPIC_API_KEY).toBeUndefined();
    expect(filtered.COWORK_HERMES_AUTH_TOKEN).toBeUndefined();
    expect(displayEnvValue("OPENAI_API_KEY", "secret")).toBe("OPENAI_API_KEY=[REDACTED]");
  });
});

describe("NetworkSandbox", () => {
  test("blocks private hosts and non-http schemes even when disabled", () => {
    const sandbox = new NetworkSandbox({ enabled: false, allowlist: [] });
    expect(sandbox.isAllowed("http://127.0.0.1:11434/v1")).toBe(false);
    expect(sandbox.isAllowed("http://169.254.169.254/latest/meta-data")).toBe(false);
    expect(sandbox.isAllowed("file:///etc/passwd")).toBe(false);
    expect(sandbox.isAllowed("https://example.com")).toBe(true);
    expect(() => sandbox.assertAllowed("http://localhost/")).toThrow(/not permitted/);
  });

  test("enforces an allowlist when enabled", () => {
    const sandbox = new NetworkSandbox({ enabled: true, allowlist: ["https://docs.example.com"] });
    expect(sandbox.isAllowed("https://docs.example.com/page")).toBe(true);
    expect(sandbox.isAllowed("https://api.example.com/page")).toBe(false);
    expect(sandbox.isAllowed("https://evil.example.com/page")).toBe(false);
  });
});

describe("AuditLog", () => {
  let home: string;
  let previous: string | undefined;
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "cowork-audit-"));
    previous = process.env.COWORK_HOME;
    process.env.COWORK_HOME = home;
  });
  afterEach(async () => {
    if (previous === undefined) delete process.env.COWORK_HOME;
    else process.env.COWORK_HOME = previous;
    await rm(home, { recursive: true, force: true });
  });

  test("read() returns the newest events from the shared audit dir", async () => {
    const log = new AuditLog({ sessionId: "s1", projectRoot: "/tmp/project" });
    await log.init();
    await log.toolCall("Read", "file.txt", 1, false);
    await log.toolDenied("Bash", "policy");
    const events = await log.read(2);
    expect(events.length).toBe(2);
    expect(events[1].outcome).toBe("denied");
    expect(events[1].toolName).toBe("Bash");
  });

  test("read() ignores malformed lines", async () => {
    const log = new AuditLog({ sessionId: "s2", projectRoot: "/tmp/project" });
    await log.init();
    await mkdir(log.auditDir, { recursive: true });
    await writeFile(log.path, "not json\n", "utf-8");
    await log.sessionStart();
    expect((await log.read()).length).toBe(1);
  });
});
