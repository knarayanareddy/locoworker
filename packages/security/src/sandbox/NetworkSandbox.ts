/**
 * Network allowlist enforcement.
 * Tracks fetch/network calls and blocks URLs not in the allowlist.
 * In Phase 6 this is advisory (logs + warns). Full enforcement
 * (intercepting native fetch) is a Phase 8 hardening concern.
 */

export interface SandboxConfig {
  enabled: boolean;
  allowlist: string[];
}

export class NetworkSandbox {
  private allowlist: Set<string>;

  constructor(private config: SandboxConfig) {
    this.allowlist = new Set(config.allowlist.map((u) => u.toLowerCase()));
  }

  isAllowed(url: string): boolean {
    if (!this.config.enabled) return true;
    if (this.allowlist.size === 0) return true;
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      // Direct match
      if (this.allowlist.has(host)) return true;
      // Suffix match (e.g. allowlist has "anthropic.com" and host is "api.anthropic.com")
      for (const allowed of this.allowlist) {
        if (host === allowed || host.endsWith("." + allowed)) return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  check(url: string, context: string): void {
    if (!this.isAllowed(url)) {
      console.warn(
        `[security] Network sandbox: "${context}" attempted to reach "${url}" which is not in the allowlist.`
      );
    }
  }

  addToAllowlist(host: string): void {
    this.allowlist.add(host.toLowerCase());
  }

  getConfig(): SandboxConfig {
    return {
      enabled: this.config.enabled,
      allowlist: [...this.allowlist],
    };
  }
}
