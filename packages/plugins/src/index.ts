/**
 * @cowork/plugins — Phase 8
 *
 * Plugin marketplace and sandboxed plugin execution.
 * This package is a typed stub until Phase 8 implementation.
 *
 * Planned surface:
 * - PluginManifest: name, version, tools, hooks, permissions
 * - PluginRegistry: load/unload/list plugins from .cowork/plugins/
 * - PluginSandbox: execute plugin code in a restricted Bun worker
 * - makePluginTools(registry): ToolDefinition[] for agent use
 */

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author?: string;
  /** Tool names this plugin exposes */
  tools?: string[];
  /** Hooks this plugin subscribes to */
  hooks?: string[];
  /** Minimum permission level required */
  minPermissionLevel?: number;
  entrypoint: string;
}

export interface Plugin {
  manifest: PluginManifest;
  loaded: boolean;
  loadedAt?: string;
}

/**
 * Stub registry — Phase 8 will implement real plugin loading + sandboxing.
 */
export class PluginRegistry {
  private plugins = new Map<string, Plugin>();

  async load(_pluginsDir: string): Promise<void> {
    // Phase 8: scan pluginsDir for manifest.json files and load them
  }

  list(): Plugin[] {
    return [...this.plugins.values()];
  }

  get(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }
}
