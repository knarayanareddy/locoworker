import type { GatewayConfig, InboundMessage, OutboundMessage, ChannelConfig } from "./types";
import { BaseChannel } from "./channels/BaseChannel";
import { TelegramChannel } from "./channels/TelegramChannel";
import { WebhookChannel } from "./channels/WebhookChannel";
import { HttpChannel } from "./channels/HttpChannel";
import { RateLimiter } from "./RateLimiter";
import { EventEmitter } from "node:events";
import { TOTPAuth } from "@cowork/security";


export type MessageHandler = (
  msg: InboundMessage,
  reply: (text: string) => Promise<void>
) => Promise<void>;

export class GatewayServer extends EventEmitter {
  private config: GatewayConfig;
  private channels = new Map<string, BaseChannel>();
  private rateLimiter: RateLimiter;
  private httpServer?: ReturnType<typeof Bun.serve>;
  private messageHandler?: MessageHandler;
  public statsProvider?: () => Promise<any>;
  private totp: TOTPAuth;
  private authenticatedUsers = new Set<string>();


  constructor(config: GatewayConfig) {
    super();
    this.config = {
      httpPort: 3721,
      rateLimitPerUser: 20,
      ...config,
    };
    this.rateLimiter = new RateLimiter(this.config.rateLimitPerUser);
    this.totp = new TOTPAuth(process.env["COWORK_GATEWAY_AUTH_TOKEN"] || "default_secret");
  }

  // ── Handler registration ───────────────────────────────────────────────────

  onMessage(handler: MessageHandler): this {
    this.messageHandler = handler;
    return this;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    // Register channels from config
    for (const channelCfg of this.config.channels) {
      const channel = this.createChannel(channelCfg);
      if (!channel) continue;

      channel.on("message", (msg: InboundMessage) => {
        void this.handleInbound(msg, channel);
      });

      await channel.start();
      this.channels.set(channelCfg.channelId, channel);
    }

    // Start HTTP server for webhook + http channels + dashboard integration
    this.httpServer = Bun.serve({
      port: this.config.httpPort,
      fetch: (req) => this.handleHttp(req),
    });

    console.log(`[OpenClaw] Gateway running on port ${this.config.httpPort}`);
    console.log(`[OpenClaw] ${this.channels.size} channel(s) active`);
  }

  async stop(): Promise<void> {
    for (const channel of this.channels.values()) {
      await channel.stop();
    }
    this.httpServer?.stop();
  }

  // ── Send ───────────────────────────────────────────────────────────────────

  async send(msg: OutboundMessage): Promise<void> {
    const channel = this.channels.get(msg.channelId);
    if (!channel) {
      throw new Error(`No channel found for channelId: ${msg.channelId}`);
    }
    await channel.send(msg);
  }

  // ── Inbound handler ────────────────────────────────────────────────────────

  private async handleInbound(msg: InboundMessage, channel: BaseChannel): Promise<void> {
    // Rate limit
    if (!this.rateLimiter.check(msg.userId)) {
      await channel.send({
        channelType: channel.channelType,
        channelId: msg.channelId,
        text: "⚠️ Rate limit exceeded. Please wait a moment.",
        replyToId: msg.metadata?.messageId as string | undefined,
      });
      return;
    }

    this.emit("message", msg);

    if (this.messageHandler) {
      const reply = async (text: string): Promise<void> => {
        await channel.send({
          channelType: channel.channelType,
          channelId: msg.channelId,
          text,
          parseMarkdown: true,
          replyToId: msg.metadata?.messageId as string | undefined,
        });
      };

      if (!this.authenticatedUsers.has(msg.userId)) {
        if (this.totp.verify(msg.text.trim())) {
          this.authenticatedUsers.add(msg.userId);
          await reply("✅ **Authenticated.** You now have remote access.");
        } else {
          await reply("🔒 **Authentication Required.** Please reply with your 6-digit TOTP code.");
        }
        return;
      }

      await this.messageHandler(msg, reply);
    }
  }

  // ── HTTP ingress ───────────────────────────────────────────────────────────

  private async handleHttp(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // Health check
    if (url.pathname === "/health") {
      return Response.json({ status: "ok", channels: this.channels.size });
    }

    // Webhook inbound: POST /webhook/<channelId>
    if (url.pathname.startsWith("/webhook/") && req.method === "POST") {
      const channelId = url.pathname.slice("/webhook/".length);
      const channel = this.channels.get(channelId);
      if (channel instanceof WebhookChannel) {
        const payload = await req.json() as Record<string, unknown>;
        channel.handleInbound(payload);
        return Response.json({ ok: true });
      }
      return Response.json({ error: "Channel not found" }, { status: 404 });
    }

    // HTTP channel: POST /message
    if (url.pathname === "/message" && req.method === "POST") {
      const body = await req.json() as { text: string; channelId?: string; userId?: string };
      const channelId = body.channelId ?? "http-default";
      const channel = this.channels.get(channelId);
      if (channel instanceof HttpChannel) {
        channel.handleInbound(body.text, body.userId);
        // Wait for reply
        const reply = await channel.waitForResponse(60_000);
        return Response.json({ reply: reply?.text ?? null });
      }
      return Response.json({ error: "HTTP channel not found" }, { status: 404 });
    }

    // Dashboard stats API
    if (url.pathname === "/api/stats") {
      if (this.statsProvider) {
        const stats = await this.statsProvider();
        return Response.json(stats, {
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      }
      return Response.json({ error: "Stats provider not configured" }, { 
        status: 501,
        headers: { "Access-Control-Allow-Origin": "*" }
      });
    }

    return new Response("Not found", { status: 404 });
  }

  // ── Channel factory ────────────────────────────────────────────────────────

  private createChannel(cfg: ChannelConfig): BaseChannel | null {
    switch (cfg.type) {
      case "telegram": return new TelegramChannel(cfg);
      case "webhook": return new WebhookChannel(cfg);
      case "http": return new HttpChannel(cfg);
      default:
        console.warn(`[OpenClaw] Unknown channel type: ${cfg.type}`);
        return null;
    }
  }
}
