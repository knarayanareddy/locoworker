/**
 * Regression tests for the P0 network / file / auth hardening (F-02, F-03,
 * F-04). Every case below is a bypass that was reproduced during the red-team
 * review and must now fail closed.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  NetworkSandbox,
  isBlockedIp,
  isBlockedIpv4,
  isBlockedIpv6,
  normalizeHost,
} from "../src/sandbox/NetworkSandbox.js";
import { HttpGuard } from "../src/network/HttpGuard.js";
import { ensurePrivateDir, writePrivateFile, appendPrivateFile } from "../src/audit/secureFile.js";
import { AuditLog } from "../src/audit/AuditLog.js";

describe("F-03: SSRF host normalization", () => {
  const sandbox = new NetworkSandbox({ enabled: false, allowlist: [] });

  test("default config still blocks loopback, metadata and non-http schemes", () => {
    expect(sandbox.isAllowed("http://127.0.0.1:11434/v1")).toBe(false);
    expect(sandbox.isAllowed("http://169.254.169.254/latest/meta-data")).toBe(false);
    expect(sandbox.isAllowed("file:///etc/passwd")).toBe(false);
    expect(sandbox.isAllowed("https://example.com")).toBe(true);
    expect(() => sandbox.assertAllowed("http://localhost/")).toThrow(/not permitted/);
  });

  test("every hostname / IP encoding bypass reproduced in the review is denied", () => {
    const bypasses = [
      "http://localhost./",
      "http://LOCALHOST./",
      "http://[::ffff:127.0.0.1]/",
      "http://[::ffff:7f00:1]/",
      "http://[fe80::1]/",
      "http://[fc00::1]/",
      "http://100.64.0.1/",
      "http://192.0.0.1/",
      "http://198.18.0.1/",
      "http://2130706433/",
      "http://0x7f000001/",
      "http://127.0.0.1.nip.io/",
      "http://192.168.1.1.sslip.io/",
      "http://foo.localhost/",
      "http://metadata.internal/",
    ];
    for (const url of bypasses) expect(sandbox.isAllowed(url)).toBe(false);
  });

  test("users, passwords and credentials-in-URL are rejected", () => {
    expect(sandbox.isAllowed("https://user:pass@example.com/")).toBe(false);
  });

  test("IP classifiers cover special-use ranges and host normalization", () => {
    expect(normalizeHost("[FE80::1%25eth0]")).toBe("fe80::1");
    expect(normalizeHost("LOCALHOST.")).toBe("localhost");
    expect(isBlockedIpv4("100.64.0.1")).toBe(true);
    expect(isBlockedIpv4("198.18.0.1")).toBe(true);
    expect(isBlockedIpv4("8.8.8.8")).toBe(false);
    expect(isBlockedIpv6("::1")).toBe(true);
    expect(isBlockedIpv6("::ffff:7f00:1")).toBe(true);
    expect(isBlockedIpv6("2606:4700:4700::1111")).toBe(false);
    expect(isBlockedIp("::ffff:127.0.0.1")).toBe(true);
  });

  test("an explicit allowlist still works for public hosts", () => {
    const allowed = new NetworkSandbox({ enabled: true, allowlist: ["https://docs.example.com"] });
    expect(allowed.isAllowed("https://docs.example.com/page")).toBe(true);
    expect(allowed.isAllowed("https://api.example.com/page")).toBe(false);
    expect(allowed.isAllowed("https://evil.example.com/page")).toBe(false);
  });

  test("DNS resolution recheck fails closed on a blocked address", async () => {
    // 127.0.0.1 is an IP literal, so no DNS lookup occurs; a lookup failure
    // for an unresolvable public name must still be rejected.
    const s = new NetworkSandbox({ enabled: false, allowlist: [] });
    await expect(
      s.assertDnsAllowed("https://this-host-does-not-exist.invalid/", "test"),
    ).rejects.toThrow(/\[security\]/);
  });
});

describe("F-02 / HttpGuard: multiple token identities", () => {
  test("additional tokens are accepted and the presented token is exposed", () => {
    const guard = new HttpGuard({
      serviceName: "test",
      tokenEnvVar: "COWORK_TEST_TOKEN",
      token: "primary-token-1234567890",
      additionalTokens: ["secondary-token-1234567890"],
      env: {},
    });
    const req = (t: string) =>
      new Request("http://127.0.0.1/message", { headers: { Authorization: `Bearer ${t}` } });
    expect(guard.authorize(req("primary-token-1234567890"))).toBeNull();
    expect(guard.authorize(req("secondary-token-1234567890"))).toBeNull();
    expect(guard.presentedToken(req("secondary-token-1234567890"))).toBe("secondary-token-1234567890");
    expect(guard.authorize(req("wrong-token-1234567890"))?.status).toBe(401);
  });
});

describe("F-04: private state writers", () => {
  let home: string;
  let previous: string | undefined;
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "cowork-mode-"));
    previous = process.env.COWORK_HOME;
    process.env.COWORK_HOME = home;
  });
  afterEach(async () => {
    if (previous === undefined) delete process.env.COWORK_HOME;
    else process.env.COWORK_HOME = previous;
    await rm(home, { recursive: true, force: true });
  });

  test("secureFile helpers create 0700 dirs and 0600 files", async () => {
    const dir = join(home, "audit");
    await ensurePrivateDir(dir);
    expect((await stat(dir)).mode & 0o777).toBe(0o700);
    const f = join(dir, "events.ndjson");
    await writePrivateFile(f, "a\n");
    await appendPrivateFile(f, "b\n");
    expect((await stat(f)).mode & 0o777).toBe(0o600);
  });

  test("AuditLog writes private files and scrubs before truncating", async () => {
    const log = new AuditLog({ sessionId: "s1", projectRoot: home });
    await log.init();
    // A PEM block that starts before the 500-char cap but ends after it.
    // Slicing first used to cut off the END marker, so the key body was
    // written to the audit log unredacted.
    const keyBody = "MIIEvQIBADANBgkqhkiG9w0BAQEFAASC".repeat(30);
    const secret = "prefix ".repeat(60) +
      "-----BEGIN PRIVATE KEY-----\n" + keyBody + "\n-----END PRIVATE KEY-----";
    await log.toolCall("Read", secret, 1, false);
    expect((await stat(log.path)).mode & 0o777).toBe(0o600);
    const raw = await Bun.file(log.path).text();
    expect(raw).not.toContain("MIIEvQIBADANBgkqhkiG9w0BAQEFAASC");
    expect(raw).toContain("[PRIVATE_KEY]");
  });
});
