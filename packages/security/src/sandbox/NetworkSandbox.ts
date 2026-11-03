/**
 * Network allowlist enforcement for outbound fetches.
 *
 * `assertAllowed` throws and `isAllowed` blocks loopback/private/link-local/
 * special-use addresses so an LLM-supplied URL cannot reach internal
 * services (SSRF). Host matching is done on the WHATWG-normalized hostname,
 * which folds decimal/octal/hex IPv4 literals, trailing dots and brackets.
 *
 * `assertDnsAllowed` adds a resolved-IP recheck for hostnames (DNS rebinding
 * defence) and is called by HttpFetch immediately before the request.
 */
export type PinnedAddress = { address: string; family: number };

export interface SandboxConfig {
  enabled: boolean;
  allowlist: string[];
  /** Reject private IP literals (and localhost) even if allowlisted. Default true. */
  blockPrivateHosts?: boolean;
}

/** Suffixes that either resolve to loopback or are reserved/non-routable. */
const RESERVED_HOST_SUFFIXES = [
  "localhost",
  "localhost.localdomain",
  "local",
  "internal",
  "home.arpa",
  "localtest.me",
  "lvh.me",
  "nip.io",
  "sslip.io",
  "onion",
  "test",
  "invalid",
  "example",
];

/** Public DNS services that encode an IP in the hostname (rebinding). */
const IP_ENCODING_HOSTS = ["nip.io", "sslip.io"];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = value * 256 + n;
  }
  return value >>> 0;
}

/** All IPv4 ranges an outbound request must never reach. */
export function isBlockedIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return false;
  const a = (n >>> 24) & 0xff;
  const b = (n >>> 16) & 0xff;
  return (
    a === 0 ||                                  // 0.0.0.0/8 "this network"
    a === 10 ||                                 // RFC1918
    a === 127 ||                                // loopback
    (a === 100 && b >= 64 && b <= 127) ||       // 100.64.0.0/10 CGNAT
    (a === 169 && b === 254) ||                 // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||        // RFC1918
    (a === 192 && b === 0 && ((n >>> 8) & 0xff) === 0) || // 192.0.0.0/24
    (a === 192 && b === 168) ||                 // RFC1918
    (a === 198 && (b === 18 || b === 19)) ||    // benchmarking
    (a === 198 && b === 51 && ((n >>> 8) & 0xff) === 100) || // documentation
    (a === 203 && b === 0 && ((n >>> 8) & 0xff) === 113) ||   // documentation
    (a === 192 && b === 0 && ((n >>> 8) & 0xff) === 2) ||     // documentation
    (a === 192 && b === 88 && ((n >>> 8) & 0xff) === 99) ||   // 6to4 relay anycast
    a >= 224                                    // multicast + reserved
  );
}

/** Expand an IPv6 address into 8 16-bit groups; returns null if unparsable. */
function expandIpv6(host: string): number[] | null {
  let value = host.split("%")[0].toLowerCase();
  // IPv4-mapped / IPv4-compatible dotted tail -> hex groups
  const tail = value.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (tail) {
    const n = ipv4ToInt(tail[1]);
    if (n === null) return null;
    const hi = ((n >>> 16) & 0xffff).toString(16);
    const lo = (n & 0xffff).toString(16);
    value = value.slice(0, -tail[1].length) + hi + ":" + lo;
  }
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = 8 - left.length - right.length;
  if (fill < 0) return null;
  const groups = [...left, ...Array(halves.length === 2 ? fill : 0).fill("0"), ...right];
  if (groups.length !== 8) return null;
  const out: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    out.push(parseInt(g, 16));
  }
  return out;
}

/** All IANA special-use IPv6 ranges an outbound request must never reach. */
export function isBlockedIpv6(host: string): boolean {
  const groups = expandIpv6(host);
  if (!groups) return true; // fail closed on anything we cannot parse
  const [a, b, c, d, e, f, g, h] = groups;
  const first4Zero = a === 0 && b === 0 && c === 0 && d === 0;
  const first5Zero = first4Zero && e === 0;
  const first6Zero = first5Zero && f === 0;

  const embeddedIpv4 = (): boolean => {
    const n = (((g & 0xffff) << 16) | (h & 0xffff)) >>> 0;
    return isBlockedIpv4(`${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`);
  };

  // :: (unspecified), ::1 (loopback)
  if (groups.every((x) => x === 0)) return true;
  if (first6Zero && g === 0 && h === 1) return true;
  // ::ffff:0:0/96 IPv4-mapped and ::ffff:0:0:0/96 IPv4-translated
  if (first5Zero && f === 0xffff) return embeddedIpv4();
  if (first4Zero && e === 0xffff && f === 0) return embeddedIpv4();
  // ::a.b.c.d (deprecated IPv4-compatible) — classify the embedded IPv4
  if (first6Zero && (g !== 0 || h !== 1)) return embeddedIpv4();
  // 64:ff9b::/96 well-known NAT64 prefix
  if (a === 0x0064 && b === 0xff9b && c === 0 && d === 0 && e === 0) return embeddedIpv4();
  // 64:ff9b:1::/48 local-use NAT64 (always non-global)
  if (a === 0x0064 && b === 0xff9b && c === 0x0001) return true;
  // 2002::/16 6to4 (deprecated; embeds an arbitrary IPv4 in b:c)
  if (a === 0x2002) return true;
  // 2001::/32 Teredo, 2001:2::/48 benchmarking, 2001:10::/28 + 2001:20::/28
  // ORCHID/ORCHIDv2, 2001:db8::/32 documentation
  if (a === 0x2001 && (b === 0x0000 || b === 0x0002 || b === 0x0db8 ||
      (b >= 0x0010 && b <= 0x002f))) return true;
  // 100::/64 discard-only
  if (a === 0x0100 && b === 0 && c === 0 && d === 0) return true;
  // 3fff::/20 documentation (RFC 9637)
  if (a === 0x3fff && b < 0x1000) return true;
  // fc00::/7 unique local, fec0::/10 site-local, fe80::/10 link-local,
  // ff00::/8 multicast
  if ((a & 0xfe00) === 0xfc00) return true;
  if ((a & 0xffc0) === 0xfec0) return true;
  if ((a & 0xffc0) === 0xfe80) return true;
  if ((a & 0xff00) === 0xff00) return true;
  return false;
}

export function normalizeHost(hostname: string): string {
  return hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "")
    .replace(/%.*$/, "");
}

export function isBlockedIp(ip: string): boolean {
  if (ip.includes(":")) return isBlockedIpv6(ip);
  return isBlockedIpv4(ip);
}

function isBlockedHost(host: string): boolean {
  if (!host) return true;
  if (host.includes(":")) return isBlockedIpv6(host);
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return isBlockedIpv4(host);
  if (RESERVED_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`))) return true;
  // e.g. 127-0-0-1.nip.io / 127.0.0.1.nip.io
  if (IP_ENCODING_HOSTS.some((s) => host === s || host.endsWith(`.${s}`))) return true;
  return false;
}

export class NetworkSandbox {
  private allowlist: Set<string>;
  readonly enabled: boolean;
  readonly blockPrivateHosts: boolean;

  constructor(config: SandboxConfig) {
    this.enabled = config.enabled;
    this.blockPrivateHosts = config.blockPrivateHosts ?? true;
    this.allowlist = new Set(
      config.allowlist.map((u) => normalizeHost(
        u.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, ""),
      )),
    );
  }

  /** Default policy used by every guarded fetch. Allowlist enforcement is on
   *  by default; COWORK_SANDBOX_ENABLED=false is an explicit opt-out. */
  static default(env: NodeJS.ProcessEnv = process.env): NetworkSandbox {
    return NetworkSandbox.fromEnv(env);
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): NetworkSandbox {
    return new NetworkSandbox({
      enabled: env.COWORK_SANDBOX_ENABLED !== "false",
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
    if (parsed.username || parsed.password) return false;
    const host = normalizeHost(parsed.hostname);
    if (this.blockPrivateHosts && isBlockedHost(host)) return false;
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

  /**
   * Resolve a URL to concrete IP addresses, validate **every** answer and
   * return them so the caller can pin the connection (no second DNS lookup).
   * This closes the DNS-rebinding TOCTOU gap: `fetch()` re-resolves on its
   * own, so a plain pre-flight lookup is not sufficient. Fails closed.
   */
  async resolvePinnedAddresses(url: string, context = "fetch"): Promise<PinnedAddress[]> {
    this.assertAllowed(url, context);
    const host = normalizeHost(new URL(url).hostname);
    if (host.includes(":")) return [{ address: host, family: 6 }];
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return [{ address: host, family: 4 }];
    try {
      const { lookup } = await import("node:dns/promises");
      const answers = await lookup(host, { all: true, verbatim: true });
      if (!answers.length) {
        throw new Error(`[security] ${context}: "${host}" did not resolve`);
      }
      if (this.blockPrivateHosts && answers.some((a) => isBlockedIp(a.address))) {
        throw new Error(`[security] ${context}: "${host}" resolves to a blocked address`);
      }
      return answers.map((a) => ({ address: a.address, family: a.family }));
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("[security]")) throw e;
      throw new Error(`[security] ${context}: DNS resolution failed for "${host}"`);
    }
  }

  /** Re-check DNS before the request (fails closed on lookup errors). */
  async assertDnsAllowed(url: string, context = "fetch"): Promise<void> {
    await this.resolvePinnedAddresses(url, context);
  }

  /** Backwards-compatible alias, now enforcing rather than just warning. */
  check(url: string, context = "fetch"): void {
    this.assertAllowed(url, context);
  }

  addToAllowlist(host: string): void {
    this.allowlist.add(normalizeHost(host.trim()));
  }

  getConfig(): SandboxConfig {
    return {
      enabled: this.enabled,
      allowlist: [...this.allowlist],
      blockPrivateHosts: this.blockPrivateHosts,
    };
  }
}
