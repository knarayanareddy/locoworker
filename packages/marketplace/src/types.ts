export interface MarketplaceEntry {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  tags: string[];
  downloadUrl: string;
  homepage?: string;
  license: string;
  stars?: number;
  downloads?: number;
  updatedAt: string;
  entrypoint: string;    // e.g. "dist/index.js"
  peerDependencies?: Record<string, string>;
}

export interface MarketplaceIndex {
  plugins: MarketplaceEntry[];
  generatedAt: string;
  totalPlugins: number;
}

export interface InstallResult {
  success: boolean;
  pluginId: string;
  version: string;
  installedAt: string;
  error?: string;
}
