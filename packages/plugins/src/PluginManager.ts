import type { Plugin, PluginInstance, PluginContext } from "./types";
import type { ToolDefinition } from "@cowork/core";

export class PluginManager {
  private instances = new Map<string, PluginInstance>();
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  async load(plugin: Plugin, config: Record<string, any> = {}): Promise<void> {
    if (this.instances.has(plugin.metadata.name)) return;

    const ctx: PluginContext = { projectRoot: this.projectRoot, config };
    if (plugin.onEnable) await plugin.onEnable(ctx);

    this.instances.set(plugin.metadata.name, {
      name: plugin.metadata.name,
      version: plugin.metadata.version,
      loaded: true,
      plugin,
    });
  }

  async loadAll(plugins: Plugin[]): Promise<void> {
    for (const p of plugins) await this.load(p);
  }

  async unload(name: string): Promise<boolean> {
    const inst = this.instances.get(name);
    if (!inst) return false;

    const ctx: PluginContext = { projectRoot: this.projectRoot, config: {} };
    if (inst.plugin.onDisable) await inst.plugin.onDisable(ctx);

    this.instances.delete(name);
    return true;
  }

  getTools(): ToolDefinition[] {
    const tools: ToolDefinition[] = [];
    for (const inst of this.instances.values()) {
      tools.push(...inst.plugin.tools);
    }
    return tools;
  }

  list(): PluginInstance[] {
    return [...this.instances.values()];
  }
}
