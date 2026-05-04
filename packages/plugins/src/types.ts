import type { ToolDefinition } from "@cowork/core";

export interface PluginMetadata {
  name: string;
  version: string;
  description: string;
  author?: string;
}

export interface Plugin {
  metadata: PluginMetadata;
  tools: ToolDefinition[];
  onEnable?: (context: PluginContext) => Promise<void>;
  onDisable?: (context: PluginContext) => Promise<void>;
}

export interface PluginContext {
  projectRoot: string;
  config: Record<string, any>;
}

export interface PluginInstance {
  name: string;
  version: string;
  loaded: boolean;
  plugin: Plugin;
}
