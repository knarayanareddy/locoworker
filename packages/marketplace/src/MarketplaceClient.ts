import type { MarketplaceIndex, MarketplaceEntry, InstallResult } from "./types";
import { MemorySystem, assertSafeId, guardPath } from "@cowork/core";
import { ensurePrivateDir, writePrivateFile } from "@cowork/security/audit";
import path from "path";
import { guardedFetch } from "@cowork/security/network";
import {
  loadTrustedPluginKeys,
  verifyPluginBundle,
  type InstalledPluginManifest,
} from "./pluginSignature.js";

// Default registry — can be overridden via env
const DEFAULT_REGISTRY_URL =
  process.env.COWORK_MARKETPLACE_URL ??
  "https://raw.githubusercontent.com/knarayanareddy/locoworker/main/marketplace/index.json";

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export interface MarketplaceClientOptions {
  /** Explicitly trusted Ed25519 public keys (tests / CLI). */
  trustedKeys?: readonly string[];
  /** Environment used for the trusted-key lookup. */
  env?: NodeJS.ProcessEnv;
  /** Inject the index instead of fetching it (deterministic tests). */
  index?: MarketplaceIndex;
  /** Inject a bundle instead of downloading it (deterministic tests). */
  bundle?: (entry: MarketplaceEntry) => string | Promise<string>;
}

export class MarketplaceClient {
  private projectRoot: string;
  private registryUrl: string;
  private options: MarketplaceClientOptions;
  private cachedIndex: { data: MarketplaceIndex; fetchedAt: number } | null = null;

  constructor(
    projectRoot: string,
    registryUrlOrOptions: string | MarketplaceClientOptions = DEFAULT_REGISTRY_URL,
  ) {
    this.projectRoot = projectRoot;
    if (typeof registryUrlOrOptions === "string") {
      this.registryUrl = registryUrlOrOptions;
      this.options = {};
    } else {
      this.registryUrl = DEFAULT_REGISTRY_URL;
      this.options = registryUrlOrOptions;
    }
  }

  // ── Browse ──────────────────────────────────────────────────────────────────

  async list(opts?: {
    query?: string;
    tags?: string[];
    limit?: number;
  }): Promise<MarketplaceEntry[]> {
    const index = await this.fetchIndex();
    let plugins = index.plugins;

    if (opts?.query) {
      const q = opts.query.toLowerCase();
      plugins = plugins.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    if (opts?.tags?.length) {
      plugins = plugins.filter((p) =>
        opts.tags!.some((tag) => p.tags.includes(tag))
      );
    }

    return plugins.slice(0, opts?.limit ?? 50);
  }

  async get(id: string): Promise<MarketplaceEntry | null> {
    const index = await this.fetchIndex();
    return index.plugins.find((p) => p.id === id) ?? null;
  }

  // ── Install ─────────────────────────────────────────────────────────────────

  async install(pluginId: string): Promise<InstallResult> {
    const entry = await this.get(pluginId);
    if (!entry) {
      return {
        success: false,
        pluginId,
        version: "",
        installedAt: new Date().toISOString(),
        error: `Plugin "${pluginId}" not found in marketplace`,
      };
    }

    try {
      // Plugin code comes from a remote registry: require HTTPS, go through
      // the guarded fetch (allowlist + pinned DNS), and cap the bundle size.
      const download = new URL(entry.downloadUrl);
      if (download.protocol !== "https:") {
        throw new Error("Marketplace downloadUrl must use https");
      }
      const pluginCode = await this.download(entry);

      // R-13: verify BEFORE creating any directory or writing any file.
      // Trusted keys never come from the registry response.
      const keys = await loadTrustedPluginKeys({
        trustedKeys: this.options.trustedKeys,
        env: this.options.env,
      });
      const verified = verifyPluginBundle(pluginCode, entry, keys);
      if (!verified.ok) throw new Error(verified.error ?? "plugin verification failed");

      const pluginsRoot = path.join(MemorySystem.rootFor(this.projectRoot), "plugins");
      const pluginsDir = path.join(pluginsRoot, assertSafeId(pluginId, "plugin id"));
      await ensurePrivateDir(pluginsDir);

      // The entrypoint comes from the remote registry: confine it to the
      // plugin directory (reject ../, absolute paths and symlink escapes).
      const guarded = await guardPath(pluginsDir, entry.entrypoint ?? "index.js");
      if (guarded.error) throw new Error(guarded.error);
      const entryFile = guarded.path!;
      await ensurePrivateDir(path.dirname(entryFile));

      // O_NOFOLLOW + 0600: a pre-planted symlink must never be overwritten.
      await writePrivateFile(entryFile, pluginCode);

      const manifest: InstalledPluginManifest = {
        id: entry.id,
        name: entry.name,
        version: entry.version,
        entrypoint: entry.entrypoint ?? "index.js",
        downloadUrl: entry.downloadUrl,
        integrity: verified.integrity!,
        signature: entry.signature!,
        keyFingerprint: verified.keyFingerprint!,
        installedAt: new Date().toISOString(),
      };
      await writePrivateFile(
        path.join(pluginsDir, "manifest.json"),
        JSON.stringify(manifest, null, 2),
      );

      return {
        success: true,
        pluginId,
        version: entry.version,
        installedAt: manifest.installedAt,
      };
    } catch (err) {
      return {
        success: false,
        pluginId,
        version: entry.version,
        installedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ── Uninstall ───────────────────────────────────────────────────────────────

  async uninstall(pluginId: string): Promise<boolean> {
    const pluginDir = path.join(
      MemorySystem.rootFor(this.projectRoot),
      "plugins",
      assertSafeId(pluginId, "plugin id")
    );
    try {
      const { rm } = await import("node:fs/promises");
      await rm(pluginDir, { recursive: true, force: true });
      return true;
    } catch {
      return false;
    }
  }

  // ── Publish manifest (generates submission JSON) ────────────────────────────

  generateSubmissionTemplate(plugin: Partial<MarketplaceEntry>): string {
    const entry: MarketplaceEntry = {
      id: plugin.id ?? "my-plugin",
      name: plugin.name ?? "My Plugin",
      version: plugin.version ?? "0.1.0",
      description: plugin.description ?? "Description of my plugin",
      author: plugin.author ?? process.env.USER ?? "author",
      tags: plugin.tags ?? ["productivity"],
      downloadUrl: plugin.downloadUrl ?? "https://example.com/my-plugin.js",
      license: plugin.license ?? "MIT",
      updatedAt: new Date().toISOString(),
      entrypoint: plugin.entrypoint ?? "dist/index.js",
      signature: plugin.signature ?? "<base64 Ed25519 signature over canonical payload>",
      integrity: plugin.integrity ?? "<sha512-<hex> of the bundle bytes>",
    };
    return JSON.stringify(entry, null, 2);
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  /** Test seam: inject a bundle instead of performing a network download. */
  private async download(entry: MarketplaceEntry): Promise<string> {
    if (this.options.bundle) return this.options.bundle(entry);
    const res = await guardedFetch(entry.downloadUrl, {}, {
      context: "MarketplaceInstall",
      maxResponseBytes: 1_000_000,
    });
    if (!res.ok) throw new Error(`Download failed: ${res.statusText}`);
    return res.text();
  }

  private async fetchIndex(): Promise<MarketplaceIndex> {
    if (this.options.index) return this.options.index;
    if (
      this.cachedIndex &&
      Date.now() - this.cachedIndex.fetchedAt < CACHE_TTL_MS
    ) {
      return this.cachedIndex.data;
    }

    try {
      const res = await guardedFetch(this.registryUrl, {
        signal: AbortSignal.timeout(10_000),
      }, {
        context: "MarketplaceIndex",
        maxResponseBytes: 2_000_000,
        timeoutMs: 10_000,
      });
      if (!res.ok) throw new Error(`Registry fetch failed: ${res.statusText}`);
      const data = await res.json() as MarketplaceIndex;
      this.cachedIndex = { data, fetchedAt: Date.now() };
      return data;
    } catch {
      // Return empty index if registry unreachable
      return {
        plugins: [],
        generatedAt: new Date().toISOString(),
        totalPlugins: 0,
      };
    }
  }
}
