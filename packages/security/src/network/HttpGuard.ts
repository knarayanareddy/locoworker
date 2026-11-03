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
import { randomBytes, timingSafeEqual } from "node:crypto";

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

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
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

  /** Returns a rejection Response, or null when the request is allowed. */
  authorize(req: Request): Response | null {
    const candidate = this.extractToken(req);
    const matched = candidate !== null &&
      this.acceptedTokens.some((token) => constantTimeEquals(candidate, token));
    if (!matched) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
      const requestOrigin = new URL(req.url).origin;
      const origin = req.headers.get("origin");
      if (origin) {
        let parsed: URL;
        try {
          parsed = new URL(origin);
        } catch {
          return jsonResponse({ error: "Invalid Origin header" }, 403);
        }
        const hostHeader = req.headers.get("host");
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

/** Verify an HMAC-SHA256 webhook signature over the exact raw body. */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) return false;
  const match = /^(?:sha256=)?([0-9a-fA-F]{64})$/.exec(signatureHeader.trim());
  if (!match?.[1]) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return constantTimeEquals(match[1].toLowerCase(), expected);
}

// Imported lazily to keep the module's public surface small.
import { createHmac } from "node:crypto";
