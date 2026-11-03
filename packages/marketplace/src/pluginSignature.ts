/**
 * R-13: detached signature + integrity verification for marketplace plugins.
 *
 * The registry index is untrusted data. It must never be able to name its own
 * trusted key (that would let a malicious registry sign its own bundle).
 * Trusted Ed25519 public keys come only from:
 *   1. an explicit caller option (tests / CLI),
 *   2. `COWORK_PLUGIN_TRUSTED_KEY` in the operator's environment,
 *   3. `~/.cowork/plugin-keys.json` (`{ "keys": ["<pem or base64>", ...] }`).
 *
 * Fail closed: no key / no signature / bad signature / integrity mismatch →
 * nothing is written or loaded. Dependency-free (`node:crypto` Ed25519).
 */
import {
  createHash,
  createPublicKey,
  verify,
  type KeyObject,
} from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getCoworkHome, guardPath } from "@cowork/core";
import type { MarketplaceEntry } from "./types";

const RAW_ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export interface PluginTrustConfig {
  /** Explicitly trusted keys (highest priority, used by tests/CLI). */
  trustedKeys?: readonly string[];
  env?: NodeJS.ProcessEnv;
}

export interface InstalledPluginManifest {
  id: string;
  name: string;
  version: string;
  entrypoint: string;
  downloadUrl: string;
  integrity: string;
  signature: string;
  keyFingerprint: string;
  installedAt: string;
}

export interface PluginVerification {
  ok: boolean;
  error?: string;
  integrity?: string;
  keyFingerprint?: string;
}

/** Accept a PEM SPKI, a base64 SPKI DER, or a raw base64 32-byte Ed25519 key. */
export function parseTrustedPluginKey(raw: string): KeyObject {
  const value = raw.trim();
  if (!value) throw new Error("empty plugin signing key");
  if (value.includes("BEGIN PUBLIC KEY")) return createPublicKey(value);
  const bytes = Buffer.from(value, "base64");
  if (bytes.length === 32) {
    return createPublicKey({
      key: Buffer.concat([RAW_ED25519_SPKI_PREFIX, bytes]),
      format: "der",
      type: "spki",
    });
  }
  return createPublicKey({ key: bytes, format: "der", type: "spki" });
}

export function pluginKeyFingerprint(key: KeyObject): string {
  const der = key.export({ format: "der", type: "spki" });
  return createHash("sha256").update(der as Buffer).digest("hex");
}

export async function loadTrustedPluginKeys(
  config: PluginTrustConfig = {},
): Promise<KeyObject[]> {
  const rawKeys: string[] = [...(config.trustedKeys ?? [])];
  const env = config.env ?? process.env;
  const envKey = env.COWORK_PLUGIN_TRUSTED_KEY?.trim();
  if (envKey) rawKeys.push(envKey);

  try {
    const file = join(getCoworkHome(), "plugin-keys.json");
    const parsed = JSON.parse(await readFile(file, "utf8")) as { keys?: unknown };
    if (Array.isArray(parsed.keys)) {
      for (const key of parsed.keys) {
        if (typeof key === "string" && key.trim()) rawKeys.push(key);
      }
    }
  } catch {
    // No operator key file is fine; verification will fail closed below.
  }

  const keys: KeyObject[] = [];
  const seen = new Set<string>();
  for (const raw of rawKeys) {
    try {
      const key = parseTrustedPluginKey(raw);
      const fingerprint = pluginKeyFingerprint(key);
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      keys.push(key);
    } catch {
      // Ignore one malformed key rather than disabling all verification.
    }
  }
  return keys;
}

export function sha512Integrity(code: string): string {
  return `sha512-${createHash("sha512").update(code, "utf8").digest("hex")}`;
}

/** Fixed-field canonical payload: a registry cannot swap id/version/entrypoint. */
export function canonicalPluginPayload(entry: {
  id: string;
  version: string;
  entrypoint: string;
  downloadUrl: string;
}, integrity: string): string {
  return JSON.stringify({
    id: entry.id,
    version: entry.version,
    entrypoint: entry.entrypoint ?? "index.js",
    downloadUrl: entry.downloadUrl,
    integrity,
  });
}

export function verifyPluginBundle(
  code: string,
  entry: MarketplaceEntry,
  keys: readonly KeyObject[],
): PluginVerification {
  if (keys.length === 0) {
    return { ok: false, error: "no trusted plugin signing key configured" };
  }
  if (!entry.signature) {
    return { ok: false, error: "plugin bundle is not signed" };
  }

  const integrity = sha512Integrity(code);
  if (entry.integrity && entry.integrity !== integrity) {
    return { ok: false, error: "plugin integrity hash does not match the index" };
  }

  let signature: Buffer;
  try {
    signature = Buffer.from(entry.signature, "base64");
    if (signature.length !== 64) throw new Error("bad signature length");
  } catch {
    return { ok: false, error: "plugin signature is not valid base64 Ed25519" };
  }

  const payload = Buffer.from(canonicalPluginPayload(entry, integrity), "utf8");
  for (const key of keys) {
    let valid = false;
    try {
      valid = verify(null, payload, key, signature);
    } catch {
      valid = false;
    }
    if (valid) {
      return { ok: true, integrity, keyFingerprint: pluginKeyFingerprint(key) };
    }
  }
  return { ok: false, error: "plugin signature does not match any trusted key" };
}

/**
 * Re-verify an already-installed plugin before its code is loaded. A bundle
 * modified on disk after installation must be rejected, not executed.
 */
export async function verifyInstalledPlugin(
  pluginDir: string,
  keys: readonly KeyObject[],
): Promise<{ code: string; manifest: InstalledPluginManifest }> {
  const manifest = JSON.parse(
    await readFile(join(pluginDir, "manifest.json"), "utf8"),
  ) as InstalledPluginManifest;
  for (const field of ["id", "version", "entrypoint", "downloadUrl", "integrity", "signature"] as const) {
    if (typeof manifest[field] !== "string" || !manifest[field]) {
      throw new Error(`[plugins] incomplete manifest: missing ${field}`);
    }
  }
  const guarded = await guardPath(pluginDir, manifest.entrypoint);
  if (guarded.error) throw new Error(`[plugins] ${guarded.error}`);
  const code = await readFile(guarded.path!, "utf8");

  const result = verifyPluginBundle(code, {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: "",
    author: "",
    tags: [],
    downloadUrl: manifest.downloadUrl,
    license: "",
    updatedAt: "",
    entrypoint: manifest.entrypoint,
    integrity: manifest.integrity,
    signature: manifest.signature,
  }, keys);
  if (!result.ok) throw new Error(`[plugins] ${result.error}`);
  return { code, manifest };
}
