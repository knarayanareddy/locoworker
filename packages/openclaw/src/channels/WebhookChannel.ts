import { BaseChannel } from "./BaseChannel";
import type { ChannelConfig, InboundMessage, OutboundMessage } from "../types";
import { randomUUID } from "node:crypto";

/**
 * Generic inbound webhook channel.
 * Other systems POST JSON to /webhook/<channelId>.
 * The GatewayServer routes these requests to the appropriate channel instance.
 */
export class WebhookChannel extends BaseChannel {
  private outboundBuffer: OutboundMessage[] = [];

  constructor(config: ChannelConfig) {
    super(config);
  }

  async start(): Promise<void> {
    // Webhook channels are passive — GatewayServer calls handleInbound()
  }

  async stop(): Promise<void> {
    this.outboundBuffer = [];
  }

  async send(msg: OutboundMessage): Promise<void> {
    // For webhook channels, outbound goes to a configured callback URL
    const callbackUrl = this.config.settings?.callbackUrl as string | undefined;
    if (!callbackUrl) {
      this.outboundBuffer.push(msg);
      return;
    }

    await fetch(callbackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: msg.text, channelId: msg.channelId }),
    });
  }

  /** Called by GatewayServer when a webhook POST arrives for this channel */
  handleInbound(payload: Record<string, unknown>): void {
    const msg: InboundMessage = {
      id: randomUUID(),
      channelType: "webhook",
      channelId: this.config.channelId,
      userId: String(payload.userId ?? payload.user_id ?? "webhook-user"),
      text: String(payload.text ?? payload.message ?? ""),
      ts: Date.now(),
      metadata: payload,
    };
    if (msg.text) this.emit_message(msg);
  }

  drainBuffer(): OutboundMessage[] {
    const buf = [...this.outboundBuffer];
    this.outboundBuffer = [];
    return buf;
  }
}
