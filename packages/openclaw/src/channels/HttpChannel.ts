import { BaseChannel } from "./BaseChannel";
import type { ChannelConfig, InboundMessage, OutboundMessage } from "../types";
import { randomUUID } from "node:crypto";

/**
 * Simple HTTP long-poll channel.
 * Clients POST to /message and GET /poll to receive responses.
 * Used for the web dashboard or testing.
 */
export class HttpChannel extends BaseChannel {
  private outboundQueue: OutboundMessage[] = [];
  private subscribers = new Set<(msg: OutboundMessage) => void>();

  constructor(config: ChannelConfig) {
    super(config);
  }

  async start(): Promise<void> { /* passive */ }
  async stop(): Promise<void> {
    this.outboundQueue = [];
    this.subscribers.clear();
  }

  async send(msg: OutboundMessage): Promise<void> {
    this.outboundQueue.push(msg);
    for (const sub of this.subscribers) sub(msg);
  }

  /** Called by GatewayServer for POST /message */
  handleInbound(text: string, userId = "http-user"): void {
    const msg: InboundMessage = {
      id: randomUUID(),
      channelType: "http",
      channelId: this.config.channelId,
      userId,
      text,
      ts: Date.now(),
    };
    this.emit_message(msg);
  }

  /** Called by GET /poll endpoint — waits up to 30s for a response */
  async waitForResponse(timeoutMs = 30_000): Promise<OutboundMessage | null> {
    // If message already queued, return immediately
    if (this.outboundQueue.length > 0) return this.outboundQueue.shift()!;

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.subscribers.delete(handler);
        resolve(null);
      }, timeoutMs);

      const handler = (msg: OutboundMessage) => {
        clearTimeout(timer);
        this.subscribers.delete(handler);
        resolve(msg);
      };
      this.subscribers.add(handler);
    });
  }
}
