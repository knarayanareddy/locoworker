import type { MarketplaceIndex, MarketplaceEntry, InstallResult } from "./types";
import { MemorySystem } from "@cowork/core";
import path from "path";
import mkdir from "node:fs/promises";

// Default registry — can be overridden via env
const DEFAULT_REGISTRY_URL =
  process.env.COWORK_MARKETPLACE_URL ??
  "https://raw.githubusercontent.com/knarayanareddy/locoworker/main/marketplace/index.json";

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export class MarketplaceClient {
  private projectRoot: string;
  private registryUrl: string;
  private cachedIndex: { data: MarketplaceIndex; fetchedAt: number } | null = null;

  constructor(projectRoot: string, registryUrl = DEFAULT_REGISTRY_URL) {
    this.projectRoot = projectRoot;
    this.registryUrl = registryUrl;
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
      // Download plugin bundle
      const res = await fetch(entry.downloadUrl);
      if (!res.ok) throw new Error(`Download failed: ${res.statusText}`);

      const pluginCode = await res.text();
      const pluginsDir = path.join(
        MemorySystem.rootFor(this.projectRoot),
        "plugins",
        pluginId
      );
      // @ts-ignore
      await mkdir(pluginsDir, { recursive: true });

      // Write plugin code
      const entryFile = path.join(pluginsDir, entry.entrypoint);
      // @ts-ignore
      await mkdir(path.dirname(entryFile), { recursive: true });
      await Bun.write(entryFile, pluginCode);

      // Write manifest
      await Bun.write(
        path.join(pluginsDir, "manifest.json"),
        JSON.stringify(
          {
            id: entry.id,
            name: entry.name,
            version: entry.version,
            entrypoint: entry.entrypoint,
            installedAt: new Date().toISOString(),
          },
          null,
          2
        )
      );

      return {
        success: true,
        pluginId,
        version: entry.version,
        installedAt: new Date().toISOString(),
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
      pluginId
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
    };
    return JSON.stringify(entry, null, 2);
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private async fetchIndex(): Promise<MarketplaceIndex> {
    if (
      this.cachedIndex &&
      Date.now() - this.cachedIndex.fetchedAt < CACHE_TTL_MS
    ) {
      return this.cachedIndex.data;
    }

    try {
      const res = await fetch(this.registryUrl, {
        signal: AbortSignal.timeout(10_000),
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
