import { createHash, randomUUID } from "node:crypto";
import { RateLimiter } from "./RateLimiter.js";
import { scrubSecrets } from "@cowork/security/scrub";
import { HttpGuard, WebhookReplayCache, verifyWebhookSignature } from "@cowork/security/network";
import {
  BoundedMap,
  mergeResourceLimits,
  createEvictionLogger,
  readBoundedText,
  isBodyTooLarge,
  type ResourceLimits,
  type BoundedMapStats,
} from "@cowork/security/utils";
import type {
  GatewayConfig,
  InboundMessage,
  OutboundMessage,
  MessageHandler,
} from "./types.js";

const MAX_TEXT_LENGTH = 8_000;
const MAX_OUTBOX_MESSAGES = 50;

/** Approximate in-memory cost of one outbox (characters are ~1 byte here). */
function estimateOutbox(key: string, messages: OutboundMessage[]): number {
  let bytes = key.length + 16;
  for (const message of messages) bytes += (message.text?.length ?? 0) + 96;
  return bytes;
}

/**
 * Canonical OpenClaw HTTP gateway.
 *
 * Replaces the old TOTP-per-message design with a Bearer token (required),
 * loopback binding, origin checks and HMAC-verified webhooks.
 *
 * Identity is derived from the *token*, never from the request body. A holder
 * of token A cannot claim to be sender B, read B's outbox, or circumvent the
 * rate limiter by rotating `from`. Distinct identities are granted distinct
 * tokens via `GatewayConfig.senderTokens`.
 *
 * R-11: request bodies are capped *before* parsing, and the outbox map is
 * bounded by entry count, approximate bytes and TTL.
 */
export class GatewayServer {
  private rateLimiter: RateLimiter;
  private server: ReturnType<typeof Bun.serve> | null = null;
  private handler: MessageHandler | null = null;
  /** Outbox is scoped per sender and bounded: no unbounded principals. */
  private readonly outboxes: BoundedMap<string, OutboundMessage[]>;
  private readonly limits: ResourceLimits;
  private guard: HttpGuard | null = null;
  /** Rejects replayed webhook bodies / reused nonces. */
  private readonly webhookReplay = new WebhookReplayCache();

  constructor(private config: GatewayConfig) {
    this.rateLimiter = new RateLimiter(config.rateLimitPerMinute);
    this.limits = mergeResourceLimits(config.limits);
    const logEviction = createEvictionLogger("gateway outboxes");
    this.outboxes = new BoundedMap<string, OutboundMessage[]>({
      maxEntries: this.limits.maxOutboxPrincipals,
      maxBytes: this.limits.maxStateBytes,
      ttlMs: this.limits.outboxTtlMs,
      estimateSize: estimateOutbox,
      onEvict: (_key, _value, reason) => logEviction(reason),
    });
  }

  onMessage(handler: MessageHandler): void {
    this.handler = handler;
  }

  get httpGuard(): HttpGuard | null {
    return this.guard;
  }

  /** Live outbox bounds/eviction counters (useful for load tests and ops). */
  get resourceStats(): BoundedMapStats {
    return this.outboxes.stats();
  }

  /** The port actually bound (useful when config.port is 0 for an ephemeral port). */
  get boundPort(): number {
    return this.server?.port ?? this.config.port;
  }

  start(): void {
    this.guard = new HttpGuard({
      serviceName: "OpenClaw gateway",
      tokenEnvVar: this.config.tokenEnvVar ?? "COWORK_GATEWAY_AUTH_TOKEN",
      token: this.config.authToken,
      hostname: this.config.hostname,
      additionalTokens: Object.keys(this.config.senderTokens ?? {}),
    });
    this.guard.logStartup();
    const self = this;

    this.server = Bun.serve({
      ...this.guard.bindOptions,
      port: this.config.port,
      async fetch(req: Request): Promise<Response> {
        const url = new URL(req.url);
        if (url.pathname === "/health") {
          return Response.json({ status: "ok", port: self.config.port });
        }
        const denied = self.guard!.authorize(req);
        if (denied) return denied;

        if (req.method === "POST" && url.pathname === "/message") {
          return self.handleMessageRequest(req);
        }
        if (req.method === "POST" && url.pathname === "/webhook") {
          return self.handleWebhook(req);
        }
        if (req.method === "GET" && url.pathname === "/outbox") {
          return self.handleOutbox(req, url);
        }
        return Response.json({ error: "Not found" }, { status: 404 });
      },
    });
    process.stderr.write(`[openclaw] Gateway server listening on ${this.guard.hostname}:${this.boundPort}\n`);
  }

  stop(): void {
    this.server?.stop();
    this.server = null;
  }

  /** The authenticated principal: one token is exactly one identity. */
  private identityFor(req: Request): string {
    const token = this.guard!.presentedToken(req) ?? "";
    const label = this.config.senderTokens?.[token];
    if (label) return label;
    return `sender-${createHash("sha256").update(token).digest("hex").slice(0, 16)}`;
  }

  private handleOutbox(req: Request, url: URL): Response {
    const principal = this.identityFor(req);
    const claimed = url.searchParams.get("from") ?? req.headers.get("x-cowork-sender");
    if (claimed && claimed !== principal) {
      return Response.json(
        { error: "Sender does not match the authenticated identity" },
        { status: 403 },
      );
    }
    const denied = this.validateSender(principal);
    if (denied) return denied;
    return Response.json(this.outboxes.get(principal)?.slice(-MAX_OUTBOX_MESSAGES) ?? []);
  }

  private validateSender(from: string): Response | null {
    if (this.config.allowedSenders && this.config.allowedSenders.length > 0 && !this.config.allowedSenders.includes(from)) {
      return Response.json({ error: "Sender not allowed" }, { status: 403 });
    }
    return null;
  }

  /** Read the exact raw body under a hard byte ceiling (before any allocation). */
  private async readRaw(req: Request): Promise<
    | { ok: true; raw: string }
    | { ok: false; response: Response }
  > {
    try {
      return { ok: true, raw: await readBoundedText(req, this.limits.maxRequestBytes) };
    } catch (err) {
      if (isBodyTooLarge(err)) {
        return { ok: false, response: Response.json({ error: "Message too long" }, { status: 413 }) };
      }
      return { ok: false, response: Response.json({ error: "Invalid request body" }, { status: 400 }) };
    }
  }

  private parseObject<T>(raw: string): T | null {
    try {
      const value = JSON.parse(raw) as T;
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      return value;
    } catch {
      return null;
    }
  }

  private async handleMessageRequest(req: Request): Promise<Response> {
    const read = await this.readRaw(req);
    if (!read.ok) return read.response;
    const body = this.parseObject<{ from?: string; text?: string; metadata?: Record<string, unknown> }>(read.raw);
    if (!body) return Response.json({ error: "Invalid JSON" }, { status: 400 });

    const principal = this.identityFor(req);
    const claimed = body.from === undefined ? undefined : body.from.slice(0, 128);
    if (claimed && claimed !== principal) {
      return Response.json(
        { error: "Sender does not match the authenticated identity" },
        { status: 403 },
      );
    }
    const text = body.text ?? "";
    if (!text.trim()) return Response.json({ error: "Empty message" }, { status: 400 });
    if (text.length > MAX_TEXT_LENGTH) return Response.json({ error: "Message too long" }, { status: 413 });
    // Key the limiter on the token identity, not on a client-supplied string.
    if (!this.rateLimiter.isAllowed(principal)) return Response.json({ error: "Rate limit exceeded" }, { status: 429 });
    const denied = this.validateSender(principal);
    if (denied) return denied;

    return this.respondTo({
      id: randomUUID(),
      channel: "http",
      from: principal,
      text: scrubSecrets(text),
      timestamp: new Date().toISOString(),
      metadata: body.metadata,
    });
  }

  private async handleWebhook(req: Request): Promise<Response> {
    if (!this.config.webhookSecret) {
      return Response.json({ error: "Webhook ingress is not configured" }, { status: 404 });
    }
    const read = await this.readRaw(req);
    if (!read.ok) return read.response;
    // HMAC is verified over the exact bounded raw body, *before* JSON parsing.
    if (!verifyWebhookSignature(
      read.raw,
      req.headers.get("x-cowork-signature"),
      this.config.webhookSecret,
      {
        timestamp: req.headers.get("x-cowork-timestamp"),
        nonce: req.headers.get("x-cowork-nonce"),
        replay: this.webhookReplay,
      },
    )) {
      return Response.json({ error: "Invalid webhook signature" }, { status: 401 });
    }
    const payload = this.parseObject<{ from?: string; text?: string; message?: string }>(read.raw);
    if (!payload) return Response.json({ error: "Invalid JSON" }, { status: 400 });
    const principal = this.identityFor(req);
    const source = (payload.from ?? "webhook").slice(0, 128);
    const text = payload.text ?? payload.message ?? "";
    if (!text.trim()) return Response.json({ error: "Empty message" }, { status: 400 });
    if (text.length > MAX_TEXT_LENGTH) return Response.json({ error: "Message too long" }, { status: 413 });
    if (!this.rateLimiter.isAllowed(principal)) return Response.json({ error: "Rate limit exceeded" }, { status: 429 });
    const denied = this.validateSender(principal);
    if (denied) return denied;

    return this.respondTo({
      id: randomUUID(),
      channel: "webhook",
      from: principal,
      text: scrubSecrets(text),
      timestamp: new Date().toISOString(),
      metadata: { source },
    });
  }

  private async respondTo(inbound: InboundMessage): Promise<Response> {
    // Replies are returned on the same request — no shared queue that another
    // caller can drain (the old HttpChannel.waitForResponse leaked replies).
    try {
      const responseText = this.handler ? await this.handler(inbound) : "No handler registered.";
      const outbox = this.outboxes.get(inbound.from) ?? [];
      outbox.push({
        id: randomUUID(),
        inboundId: inbound.id,
        channel: inbound.channel,
        to: inbound.from,
        text: responseText,
        status: "complete",
        timestamp: new Date().toISOString(),
      });
      if (outbox.length > MAX_OUTBOX_MESSAGES) {
        outbox.splice(0, outbox.length - MAX_OUTBOX_MESSAGES);
      }
      this.outboxes.set(inbound.from, outbox);
      return Response.json({ id: inbound.id, response: responseText });
    } catch (err) {
      return Response.json(
        { error: "Handler failed", detail: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      );
    }
  }
}
