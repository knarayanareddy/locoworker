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
  /** Base64 Ed25519 signature over canonicalPluginPayload(id, version, entrypoint, downloadUrl, integrity). */
  signature?: string;
  /** `sha512-<hex>` of the exact bundle bytes. */
  integrity?: string;
  /** Optional label naming which trusted key signed this bundle. */
  keyId?: string;
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
