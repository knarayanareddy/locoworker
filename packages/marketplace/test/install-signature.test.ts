import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  generateKeyPairSync,
  sign,
  type KeyObject,
} from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemorySystem } from "@cowork/core";
import { MarketplaceClient } from "../src/MarketplaceClient.js";
import {
  canonicalPluginPayload,
  sha512Integrity,
  verifyInstalledPlugin,
  parseTrustedPluginKey,
} from "../src/pluginSignature.js";
import type { MarketplaceEntry, MarketplaceIndex } from "../src/types.js";

const CODE = "export const name = 'signed-plugin';\n";
let workDir = "";
let previousHome: string | undefined;
let publicKey: KeyObject;
let privateKey: KeyObject;
let publicPem: string;

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), "cowork-marketplace-signature-"));
  previousHome = process.env.COWORK_HOME;
  process.env.COWORK_HOME = join(workDir, "home");
  await mkdir(process.env.COWORK_HOME, { recursive: true });
  const pair = generateKeyPairSync("ed25519");
  publicKey = pair.publicKey;
  privateKey = pair.privateKey;
  publicPem = publicKey.export({ type: "spki", format: "pem" }) as string;
});

afterAll(async () => {
  if (previousHome === undefined) delete process.env.COWORK_HOME;
  else process.env.COWORK_HOME = previousHome;
  if (workDir) await rm(workDir, { recursive: true, force: true });
});

function makeEntry(overrides: Partial<MarketplaceEntry> = {}): MarketplaceEntry {
  const base = {
    id: "sample",
    name: "Sample Plugin",
    version: "1.2.3",
    description: "harmless test plugin",
    author: "cowork tests",
    tags: ["test"],
    downloadUrl: "https://example.com/plugins/sample.js",
    license: "MIT",
    updatedAt: "2026-01-01T00:00:00.000Z",
    entrypoint: "index.js",
    integrity: sha512Integrity(CODE),
  };
  const signature = sign(
    null,
    Buffer.from(canonicalPluginPayload(base, base.integrity)),
    privateKey,
  ).toString("base64");
  return { ...base, signature, ...overrides };
}

async function freshProject(label: string): Promise<string> {
  const dir = join(workDir, label);
  await mkdir(dir, { recursive: true });
  return dir;
}

function client(
  projectRoot: string,
  entry: MarketplaceEntry,
  options: { trustedKeys?: readonly string[] } = { trustedKeys: [publicPem] },
): MarketplaceClient {
  const index: MarketplaceIndex = {
    plugins: [entry],
    generatedAt: "2026-01-01T00:00:00.000Z",
    totalPlugins: 1,
  };
  return new MarketplaceClient(projectRoot, {
    index,
    bundle: () => CODE,
    trustedKeys: options.trustedKeys,
    env: {},
  });
}

function pluginDir(projectRoot: string): string {
  return join(MemorySystem.rootFor(projectRoot), "plugins", "sample");
}

describe("R-13 / B3: detached plugin signatures and integrity", () => {
  test("a valid signature installs an 0600 bundle plus a signed manifest", async () => {
    const root = await freshProject("valid");
    const result = await client(root, makeEntry()).install("sample");
    expect(result.success).toBe(true);
    const dir = pluginDir(root);
    const bundleStat = await stat(join(dir, "index.js"));
    expect(bundleStat.mode & 0o077).toBe(0); // no group/other permissions
    const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
    expect(manifest.integrity).toBe(sha512Integrity(CODE));
    expect(manifest.keyFingerprint).toMatch(/^[0-9a-f]{64}$/);
    const verified = await verifyInstalledPlugin(dir, [publicKey]);
    expect(verified.code).toBe(CODE);
  });

  test("fail closed when no trusted key is configured", async () => {
    const root = await freshProject("no-key");
    const result = await client(root, makeEntry(), { trustedKeys: [] }).install("sample");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no trusted plugin signing key/);
    await expect(stat(pluginDir(root))).rejects.toThrow();
  });

  test("a different signing key is rejected", async () => {
    const root = await freshProject("wrong-key");
    const other = generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }) as string;
    const result = await client(root, makeEntry(), { trustedKeys: [other] }).install("sample");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/does not match any trusted key/);
    await expect(stat(pluginDir(root))).rejects.toThrow();
  });

  test("an unsigned bundle is rejected even with a trusted key", async () => {
    const root = await freshProject("unsigned");
    const result = await client(root, makeEntry({ signature: undefined })).install("sample");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not signed/);
  });

  test("an integrity mismatch is rejected", async () => {
    const root = await freshProject("bad-integrity");
    const result = await client(root, makeEntry({ integrity: "sha512-deadbeef" })).install("sample");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/integrity hash/);
  });

  test("a swapped id/version/entrypoint invalidates the signature", async () => {
    const root = await freshProject("swapped");
    const result = await client(root, makeEntry({ version: "9.9.9" })).install("sample");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/signature/);
  });

  test("non-HTTPS download URLs are refused", async () => {
    const root = await freshProject("http");
    const result = await client(root, makeEntry({ downloadUrl: "http://example.com/x.js" })).install("sample");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/must use https/);
  });

  test("an entrypoint escaping the plugin directory is refused", async () => {
    const root = await freshProject("escape");
    // Re-sign so the failure is specifically the path guard, not the signature.
    const entry = makeEntry();
    entry.entrypoint = "../../../../escaped.js";
    entry.signature = sign(
      null,
      Buffer.from(canonicalPluginPayload(entry, entry.integrity)),
      privateKey,
    ).toString("base64");
    const result = await client(root, entry).install("sample");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/escape|symlink|sensitive/i);
  });

  test("a pre-planted symlink entrypoint is refused without overwriting its target", async () => {
    const root = await freshProject("symlink");
    const dir = pluginDir(root);
    const victim = join(workDir, "victim.txt");
    await writeFile(victim, "DO NOT OVERWRITE");
    await mkdir(dir, { recursive: true });
    await symlink(victim, join(dir, "index.js"));
    const result = await client(root, makeEntry()).install("sample");
    expect(result.success).toBe(false);
    expect(await readFile(victim, "utf8")).toBe("DO NOT OVERWRITE");
    expect((await lstat(join(dir, "index.js"))).isSymbolicLink()).toBe(true);
  });

  test("tampering with an installed bundle is rejected at load time", async () => {
    const root = await freshProject("tampered");
    const result = await client(root, makeEntry()).install("sample");
    expect(result.success).toBe(true);
    const dir = pluginDir(root);
    await writeFile(join(dir, "index.js"), CODE + "\n// injected\n");
    await expect(verifyInstalledPlugin(dir, [publicKey])).rejects.toThrow(/signature|integrity/i);
  });

  test("a registry-supplied keyId cannot act as a trusted key", async () => {
    // The index contains a plausible-looking public key; it must be ignored
    // because loadTrustedPluginKeys() never reads the registry response.
    const root = await freshProject("self-signed-key");
    const rogue = generateKeyPairSync("ed25519");
    const roguePem = rogue.publicKey.export({ type: "spki", format: "pem" }) as string;
    const entry = makeEntry({ keyId: roguePem });
    const result = await client(root, entry, { trustedKeys: [] }).install("sample");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no trusted plugin signing key/);
  });

  test("raw base64 Ed25519 keys are accepted too", () => {
    const raw = publicKey.export({ type: "spki", format: "der" }) as Buffer;
    const last32 = raw.subarray(raw.length - 32).toString("base64");
    const parsed = parseTrustedPluginKey(last32);
    expect(parsed.asymmetricKeyType).toBe("ed25519");
  });
});
