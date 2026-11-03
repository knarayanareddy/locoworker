import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemorySystem } from "@cowork/core";
import { canonicalPluginPayload, sha512Integrity } from "../../marketplace/src/pluginSignature.js";
import { PluginManager } from "../src/PluginManager.js";

const CODE = "export const id = 'verified';\n";
let workDir = "";
let previousHome: string | undefined;
let key: KeyObject;
let privateKey: KeyObject;
let pem: string;

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), "cowork-plugin-manager-"));
  previousHome = process.env.COWORK_HOME;
  process.env.COWORK_HOME = join(workDir, "home");
  await mkdir(process.env.COWORK_HOME, { recursive: true });
  const pair = generateKeyPairSync("ed25519");
  key = pair.publicKey;
  privateKey = pair.privateKey;
  pem = key.export({ type: "spki", format: "pem" }) as string;
});

afterAll(async () => {
  if (previousHome === undefined) delete process.env.COWORK_HOME;
  else process.env.COWORK_HOME = previousHome;
  if (workDir) await rm(workDir, { recursive: true, force: true });
});

async function install(projectRoot: string): Promise<string> {
  const dir = join(MemorySystem.rootFor(projectRoot), "plugins", "sample");
  await mkdir(dir, { recursive: true });
  const integrity = sha512Integrity(CODE);
  const entry = {
    id: "sample",
    version: "1.0.0",
    entrypoint: "index.js",
    downloadUrl: "https://example.com/sample.js",
    integrity,
  };
  const signature = sign(
    null,
    Buffer.from(canonicalPluginPayload(entry, integrity)),
    privateKey,
  ).toString("base64");
  await writeFile(join(dir, "index.js"), CODE);
  await writeFile(join(dir, "manifest.json"), JSON.stringify({
    id: "sample",
    name: "Sample",
    version: "1.0.0",
    entrypoint: "index.js",
    downloadUrl: "https://example.com/sample.js",
    integrity,
    signature,
    keyFingerprint: "n/a",
    installedAt: new Date().toISOString(),
  }, null, 2));
  return dir;
}

describe("R-13 / B3: PluginManager load-time verification", () => {
  test("a signed, unmodified plugin loads", async () => {
    const root = join(workDir, "valid");
    await mkdir(root, { recursive: true });
    await install(root);
    const manager = new PluginManager(root, [pem]);
    const loaded = await manager.load("sample");
    expect(loaded.code).toBe(CODE);
    expect(loaded.manifest.id).toBe("sample");
    expect(await manager.verifyAll(["sample"])).toEqual(["sample"]);
  });

  test("an edited bundle is rejected before any code is loaded", async () => {
    const root = join(workDir, "tampered");
    await mkdir(root, { recursive: true });
    const dir = await install(root);
    await writeFile(join(dir, "index.js"), CODE + "// injected\n");
    const manager = new PluginManager(root, [pem]);
    await expect(manager.load("sample")).rejects.toThrow(/integrity|signature/i);
    await expect(manager.verifyAll(["sample"])).rejects.toThrow(/integrity|signature/i);
  });

  test("no trusted key means fail closed", async () => {
    const root = join(workDir, "no-key");
    await mkdir(root, { recursive: true });
    await install(root);
    const manager = new PluginManager(root, []);
    await expect(manager.load("sample")).rejects.toThrow(/no trusted plugin signing key/);
  });

  test("a plugin id cannot escape the plugins directory", async () => {
    const root = join(workDir, "bad-id");
    await mkdir(root, { recursive: true });
    const manager = new PluginManager(root, [pem]);
    await expect(manager.load("../elsewhere")).rejects.toThrow();
  });
});
