/**
 * R-13: load-time plugin verification.
 *
 * Even after a signed install, the bundle on disk can be edited (or replaced
 * by a symlink) before it is loaded. `PluginManager` re-verifies the detached
 * signature and integrity hash against operator-trusted keys before returning
 * any code. Signature verification is NOT code execution — actually running a
 * plugin in a sandbox remains a future phase.
 */
import { join } from "node:path";
import { MemorySystem, assertSafeId } from "@cowork/core";
import {
  loadTrustedPluginKeys,
  verifyInstalledPlugin,
  type InstalledPluginManifest,
} from "@cowork/marketplace";

export interface LoadedPlugin {
  code: string;
  manifest: InstalledPluginManifest;
}

export class PluginManager {
  constructor(
    private projectRoot: string,
    private trustedKeys?: readonly string[],
  ) {}

  private dirFor(pluginId: string): string {
    return join(
      MemorySystem.rootFor(this.projectRoot),
      "plugins",
      assertSafeId(pluginId, "plugin id"),
    );
  }

  /** Throws unless the installed bundle is signed by a trusted key. */
  async load(pluginId: string): Promise<LoadedPlugin> {
    const keys = await loadTrustedPluginKeys({ trustedKeys: this.trustedKeys });
    const { code, manifest } = await verifyInstalledPlugin(this.dirFor(pluginId), keys);
    return { code, manifest };
  }

  /** Verify every installed plugin without returning executable code. */
  async verifyAll(pluginIds: readonly string[]): Promise<string[]> {
    const keys = await loadTrustedPluginKeys({ trustedKeys: this.trustedKeys });
    const verified: string[] = [];
    for (const id of pluginIds) {
      await verifyInstalledPlugin(this.dirFor(id), keys);
      verified.push(id);
    }
    return verified;
  }
}
