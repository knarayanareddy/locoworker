import { BaseChannel } from "./BaseChannel";
import type { ChannelConfig, InboundMessage, OutboundMessage } from "../types";
import { randomUUID } from "node:crypto";

/**
 * Telegram channel via the Bot API (long polling).
 * Requires TELEGRAM_BOT_TOKEN in env.
 * Uses the Telegram Bot API directly (no SDK dep — just fetch).
 */
export class TelegramChannel extends BaseChannel {
  private token: string;
  private polling = false;
  private offset = 0;
  private pollTimer?: ReturnType<typeof setTimeout>;

  constructor(config: ChannelConfig) {
    super(config);
    this.token = process.env.TELEGRAM_BOT_TOKEN ?? (config.settings?.token as string ?? "");
    if (!this.token) {
      // Don't throw here to allow gateway to start even if one channel is misconfigured
      console.warn("TelegramChannel: TELEGRAM_BOT_TOKEN not set, channel will be inactive");
      this.token = ""; 
    }
  }

  async start(): Promise<void> {
    if (!this.token) return;
    this.polling = true;
    this.poll();
  }

  async stop(): Promise<void> {
    this.polling = false;
    if (this.pollTimer) clearTimeout(this.pollTimer);
  }

  async send(msg: OutboundMessage): Promise<void> {
    if (!this.token) return;
    const body = {
      chat_id: msg.channelId,
      text: msg.text.slice(0, 4096),
      parse_mode: msg.parseMarkdown ? "Markdown" : undefined,
      reply_to_message_id: msg.replyToId,
    };

    const res = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Telegram send failed: ${err}`);
    }
  }

  private async poll(): Promise<void> {
    if (!this.polling || !this.token) return;

    try {
      const res = await fetch(
        `https://api.telegram.org/bot${this.token}/getUpdates?timeout=25&offset=${this.offset}`,
        { signal: AbortSignal.timeout(30_000) }
      );
      if (res.ok) {
        const data = (await res.json()) as {
          result: Array<{
            update_id: number;
            message?: {
              message_id: number;
              from?: { id: number; username?: string };
              chat: { id: number };
              text?: string;
            };
          }>;
        };

        for (const update of data.result) {
          this.offset = update.update_id + 1;
          if (update.message?.text) {
            const msg: InboundMessage = {
              id: randomUUID(),
              channelType: "telegram",
              channelId: String(update.message.chat.id),
              userId: String(update.message.from?.id ?? "unknown"),
              text: update.message.text,
              ts: Date.now(),
              metadata: { messageId: update.message.message_id },
            };
            this.emit_message(msg);
          }
        }
      }
    } catch { /* poll errors are transient */ }

    if (this.polling) {
      this.pollTimer = setTimeout(() => this.poll(), 1000);
    }
  }

  private get apiBase(): string {
    return `https://api.telegram.org/bot${this.token}`;
  }
}
