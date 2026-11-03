/**
 * Network allowlist enforcement for outbound fetches.
 *
 * Unlike the previous advisory-only implementation, `assertAllowed` throws
 * and `isAllowed` also blocks private/loopback/link-local addresses so an
 * LLM-supplied URL cannot reach internal services (SSRF).
 */
export interface SandboxConfig {
  enabled: boolean;
  allowlist: string[];
  /** Reject private IP literals (and localhost) even if allowlisted. Default true. */
  blockPrivateHosts?: boolean;
}

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^\[?::1\]?$/,
  /^\[?f[cd][0-9a-f]{2}:/i,
  /\.local$/i,
  /\.internal$/i,
];

export class NetworkSandbox {
  private allowlist: Set<string>;
  readonly enabled: boolean;
  readonly blockPrivateHosts: boolean;

  constructor(config: SandboxConfig) {
    this.enabled = config.enabled;
    this.blockPrivateHosts = config.blockPrivateHosts ?? true;
    this.allowlist = new Set(
      config.allowlist.map((u) => u.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")),
    );
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): NetworkSandbox {
    return new NetworkSandbox({
      enabled: env.COWORK_SANDBOX_ENABLED === "true",
      allowlist: (env.COWORK_SANDBOX_ALLOWLIST ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    });
  }

  /** True when `url` may be fetched. */
  isAllowed(url: string): boolean {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (this.blockPrivateHosts && PRIVATE_HOST_PATTERNS.some((p) => p.test(host))) return false;
    if (!this.enabled || this.allowlist.size === 0) return true;
    return (
      this.allowlist.has(host) ||
      [...this.allowlist].some((allowed) => host === allowed || host.endsWith(`.${allowed}`))
    );
  }

  /** Throw on a disallowed URL; returns void for easy chaining. */
  assertAllowed(url: string, context = "fetch"): void {
    if (!this.isAllowed(url)) {
      throw new Error(`[security] ${context}: network access to "${url}" is not permitted`);
    }
  }

  /** Backwards-compatible alias, now enforcing rather than just warning. */
  check(url: string, context = "fetch"): void {
    this.assertAllowed(url, context);
  }

  addToAllowlist(host: string): void {
    this.allowlist.add(host.trim().toLowerCase());
  }

  getConfig(): SandboxConfig {
    return {
      enabled: this.enabled,
      allowlist: [...this.allowlist],
      blockPrivateHosts: this.blockPrivateHosts,
    };
  }
}
