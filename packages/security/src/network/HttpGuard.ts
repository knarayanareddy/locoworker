/**
 * Shared hardening for every HTTP surface in locoworker.
 *
 * Defaults:
 *   - bind to loopback (127.0.0.1) unless COWORK_BIND_HOST is set explicitly;
 *   - require a Bearer token on every request (except /health);
 *   - reject cross-origin state-changing requests (Origin / Sec-Fetch-Site).
 *
 * A missing token is NOT a valid configuration for a remotely reachable
 * server. For local development we generate a random ephemeral token and
 * print it to stderr, but that is only permitted while bound to loopback.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export interface HttpGuardOptions {
  /** Human-readable name, used in startup messages. */
  serviceName: string;
  /** Environment variable that holds the configured token. */
  tokenEnvVar: string;
  /** Explicit token (takes precedence over the environment). */
  token?: string;
  /** Explicit bind host (takes precedence over COWORK_BIND_HOST). */
  hostname?: string;
  /** Environment snapshot; defaults to process.env. */
  env?: NodeJS.ProcessEnv;
  /** Allow an auto-generated token on loopback. Default: true. */
  allowEphemeralToken?: boolean;
  /** Extra accepted tokens (e.g. one per gateway sender identity). */
  additionalTokens?: string[];
}

export type HttpGuardInfo = {
  serviceName: string;
  hostname: string;
  tokenEnvVar: string;
  tokenSource: "configured" | "ephemeral";
  token: string;
};

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]", "localhost."]);

export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return LOOPBACK_HOSTS.has(host) || host.startsWith("127.");
}

/** Constant-time string comparison (length is intentionally leaked, value is not). */
export function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function jsonResponse(body: unknown, status: number, extra?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extra,
    },
  });
}

export class HttpGuard {
  readonly serviceName: string;
  readonly hostname: string;
  readonly tokenEnvVar: string;
  readonly tokenSource: "configured" | "ephemeral";
  readonly token: string;
  readonly allowEphemeralToken: boolean;
  private readonly acceptedTokens: string[];
  /** Failed-auth cooldowns, keyed by a hash of the presented credential. */
  private readonly failures = new Map<string, { count: number; until: number }>();

  constructor(options: HttpGuardOptions) {
    const env = options.env ?? process.env;
    this.serviceName = options.serviceName;
    this.tokenEnvVar = options.tokenEnvVar;
    this.allowEphemeralToken = options.allowEphemeralToken ?? true;
    const configured = options.token ?? env[this.tokenEnvVar] ?? "";
    this.hostname = options.hostname ?? env.COWORK_BIND_HOST ?? "127.0.0.1";

    if (!isLoopbackHost(this.hostname) && configured.length === 0) {
      throw new Error(
        `[security] ${this.serviceName}: refusing to bind ${this.hostname} without ${this.tokenEnvVar}. ` +
          `Set a strong token or bind to 127.0.0.1.`,
      );
    }
    if (configured.length === 0 && !this.allowEphemeralToken) {
      throw new Error(
        `[security] ${this.serviceName}: ${this.tokenEnvVar} is required (ephemeral tokens are disabled).`,
      );
    }
    if (configured.length > 0 && configured.length < 16) {
      throw new Error(`[security] ${this.serviceName}: ${this.tokenEnvVar} must be at least 16 characters.`);
    }

    this.tokenSource = configured.length > 0 ? "configured" : "ephemeral";
    this.token = configured.length > 0 ? configured : randomBytes(32).toString("hex");
    const extras = (options.additionalTokens ?? []).filter((t) => t !== this.token);
    const weak = extras.find((t) => t.length < 16);
    if (weak) {
      throw new Error(`[security] ${this.serviceName}: an additional token is shorter than 16 characters.`);
    }
    this.acceptedTokens = [this.token, ...extras];
  }

  /** Bun.serve options fragment. Always set a hostname explicitly. */
  get bindOptions(): { hostname: string } {
    return { hostname: this.hostname };
  }

  info(): HttpGuardInfo {
    return {
      serviceName: this.serviceName,
      hostname: this.hostname,
      tokenEnvVar: this.tokenEnvVar,
      tokenSource: this.tokenSource,
      token: this.token,
    };
  }

  /** Print a startup banner. Never logs a configured token. */
  logStartup(): void {
    const lines = [
      `[security] ${this.serviceName} listening on ${this.hostname}`,
      `[security] token source: ${this.tokenSource} (${this.tokenEnvVar})`,
    ];
    if (this.tokenSource === "ephemeral") {
      lines.push(`[security] ephemeral token (loopback only): ${this.token}`);
      lines.push(`[security] send it as "Authorization: Bearer <token>" or "X-Cowork-Token: <token>"`);
    }
    process.stderr.write(lines.join("\n") + "\n");
  }

  /** The token presented by the request, once authorize() has succeeded. */
  presentedToken(req: Request): string | null {
    return this.extractToken(req);
  }

  private extractToken(req: Request): string | null {
    const auth = req.headers.get("authorization") ?? "";
    const bearer = /^Bearer\s+(.+)$/i.exec(auth);
    if (bearer?.[1]) return bearer[1].trim();
    const header = req.headers.get("x-cowork-token");
    return header && header.trim().length > 0 ? header.trim() : null;
  }

  private failureKey(req: Request, candidate: string | null): string {
    const label = candidate ?? `${req.headers.get("user-agent") ?? ""}|${req.headers.get("x-cowork-client") ?? ""}`;
    return createHash("sha256").update(label).digest("hex").slice(0, 24);
  }

  /** Reject Host headers that do not match the interface we bound to. */
  private acceptableHost(hostHeader: string): boolean {
    const bare = hostHeader.replace(/:\d+$/, "").replace(/^\[|\]$/g, "").toLowerCase();
    const bound = this.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return bare === bound || isLoopbackHost(bare);
  }

  /** Returns a rejection Response, or null when the request is allowed. */
  authorize(req: Request): Response | null {
    const candidate = this.extractToken(req);
    const key = this.failureKey(req, candidate);
    const now = Date.now();
    const failure = this.failures.get(key);
    if (failure && failure.until > now) {
      const seconds = Math.max(1, Math.ceil((failure.until - now) / 1000));
      return jsonResponse(
        { error: "Too many failed authentication attempts" },
        429,
        { "Retry-After": String(seconds) },
      );
    }

    const matched = candidate !== null &&
      this.acceptedTokens.some((token) => constantTimeEquals(candidate, token));
    if (!matched) {
      // Exponential cooldown: brute-forcing a token becomes ~2^n slower.
      const count = (failure?.count ?? 0) + 1;
      const delay = Math.min(60_000, 250 * 2 ** Math.min(count, 8));
      this.failures.set(key, { count, until: now + delay });
      if (this.failures.size > 512) {
        for (const [k, v] of this.failures) if (v.until < now) this.failures.delete(k);
      }
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    this.failures.delete(key);

    if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
      const hostHeader = req.headers.get("host");
      if (hostHeader && !this.acceptableHost(hostHeader)) {
        return jsonResponse({ error: "Unexpected Host header" }, 403);
      }
      const requestOrigin = new URL(req.url).origin;
      const origin = req.headers.get("origin");
      if (origin) {
        let parsed: URL;
        try {
          parsed = new URL(origin);
        } catch {
          return jsonResponse({ error: "Invalid Origin header" }, 403);
        }
        const sameOrigin =
          parsed.origin === requestOrigin ||
          (hostHeader !== null && parsed.host === hostHeader);
        if (!sameOrigin) {
          return jsonResponse({ error: "Cross-origin request rejected" }, 403);
        }
      }
      if ((req.headers.get("sec-fetch-site") ?? "").toLowerCase() === "cross-site") {
        return jsonResponse({ error: "Cross-site request rejected" }, 403);
      }
    }
    return null;
  }
}

/**
 * Bounded replay cache for webhook nonces (or, for legacy senders, a digest
 * of the exact signed body). Entries expire after `ttlMs`.
 */
export class WebhookReplayCache {
  private readonly seen = new Map<string, number>();
  constructor(private readonly ttlMs = 5 * 60_000) {}

  check(key: string, now = Date.now()): boolean {
    for (const [k, t] of this.seen) if (t + this.ttlMs < now) this.seen.delete(k);
    if (this.seen.has(key)) return false;
    this.seen.set(key, now);
    return true;
  }
}

export interface WebhookVerificationContext {
  /** Unix ms; when supplied the HMAC covers `timestamp.nonce.rawBody`. */
  timestamp?: string | null;
  nonce?: string | null;
  maxSkewMs?: number;
  /** Enables replay rejection. Strongly recommended for every caller. */
  replay?: WebhookReplayCache;
}

/** Verify an HMAC-SHA256 webhook signature over the exact raw body. */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  ctx: WebhookVerificationContext = {},
): boolean {
  if (!signatureHeader || !secret) return false;
  const match = /^(?:sha256=)?([0-9a-fA-F]{64})$/.exec(signatureHeader.trim());
  if (!match?.[1]) return false;

  let payload = rawBody;
  if (ctx.timestamp != null || ctx.nonce != null) {
    const ts = Number(ctx.timestamp);
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > (ctx.maxSkewMs ?? 300_000)) return false;
    if (!ctx.nonce || !ctx.replay) return false;
    payload = `${ctx.timestamp}.${ctx.nonce}.${rawBody}`;
  }

  const expected = createHmac("sha256", secret).update(payload, "utf8").digest("hex");
  if (!constantTimeEquals(match[1].toLowerCase(), expected)) return false;

  if (ctx.replay) {
    const key = ctx.nonce ?? createHash("sha256").update(rawBody, "utf8").digest("hex");
    if (!ctx.replay.check(key)) return false;
  }
  return true;
}
