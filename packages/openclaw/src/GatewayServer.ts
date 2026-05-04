import { EventEmitter } from "node:events";
import type { GatewayConfig, InboundMessage, OutboundMessage } from "./types";
import { BaseChannel } from "./BaseChannel";
import { TelegramChannel } from "./channels/TelegramChannel";

export class GatewayServer extends EventEmitter {
  private config: GatewayConfig;
  private channels = new Map<string, BaseChannel>();
  private rateLimits = new Map<string, number[]>();

  constructor(config: GatewayConfig) {
    super();
    this.config = config;

    for (const c of config.channels) {
      if (c.type === "telegram" && c.token) {
        this.addChannel(new TelegramChannel(c.id, c.token));
      }
    }
  }

  addChannel(channel: BaseChannel): void {
    this.channels.set(channel.id, channel);
    channel.on("message", (msg: InboundMessage) => {
      if (this.isRateLimited(msg)) return;
      this.emit("message", msg);
    });
  }

  async start(): Promise<void> {
    await Promise.all([...this.channels.values()].map((c) => c.start()));

    if (this.config.httpPort) {
      this.startHttpServer();
    }
  }

  async send(
    channelId: string,
    targetId: string,
    message: OutboundMessage
  ): Promise<void> {
    const channel = this.channels.get(channelId);
    if (!channel) throw new Error(`Channel not found: ${channelId}`);
    await channel.send(targetId, message);
  }

  private isRateLimited(msg: InboundMessage): boolean {
    const limit = this.config.rateLimitPerUser ?? 20;
    const key = `${msg.channelId}:${msg.senderId}`;
    const now = Date.now();
    const window = now - 60_000;

    let hits = (this.rateLimits.get(key) ?? []).filter((ts) => ts > window);
    if (hits.length >= limit) return true;

    hits.push(now);
    this.rateLimits.set(key, hits);
    return false;
  }

  private startHttpServer(): void {
    const self = this;
    Bun.serve({
      port: this.config.httpPort,
      async fetch(req) {
        const url = new URL(req.url);

        if (url.pathname.startsWith("/webhook/")) {
          const channelId = url.pathname.split("/")[2];
          const body = await req.json();
          self.emit("webhook", { channelId, body });
          return Response.json({ status: "ok" });
        }

        return new Response("OpenClaw Gateway", { status: 200 });
      },
    });
    console.error(`[OpenClaw] HTTP Gateway running on port ${this.config.httpPort}`);
  }
}
