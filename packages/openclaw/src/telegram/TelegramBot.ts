import { randomUUID } from "node:crypto";
import type { InboundMessage, MessageHandler } from "../gateway/types.js";
import { RateLimiter } from "../gateway/RateLimiter.js";

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; username?: string; first_name?: string };
    chat: { id: number };
    text?: string;
    date: number;
  };
}

interface TelegramBotConfig {
  token: string;
  rateLimitPerMinute?: number;
  allowedChatIds?: number[];
  pollingIntervalMs?: number;
}

export class TelegramBot {
  private rateLimiter: RateLimiter;
  private handler: MessageHandler | null = null;
  private lastUpdateId = 0;
  private polling = false;
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private apiBase: string;

  constructor(private config: TelegramBotConfig) {
    this.apiBase = `https://api.telegram.org/bot${config.token}`;
    this.rateLimiter = new RateLimiter(config.rateLimitPerMinute ?? 10);
  }

  onMessage(handler: MessageHandler): void {
    this.handler = handler;
  }

  startPolling(): void {
    if (this.polling) return;
    this.polling = true;
    this.pollingTimer = setInterval(
      () => void this.poll(),
      this.config.pollingIntervalMs ?? 2000
    );
    process.stderr.write(`[openclaw/telegram] Polling started.\n`);
  }

  stopPolling(): void {
    this.polling = false;
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  async sendMessage(chatId: number, text: string): Promise<void> {
    const chunks = this.chunkMessage(text, 4096);
    for (const chunk of chunks) {
      try {
        await fetch(`${this.apiBase}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: chunk, parse_mode: "Markdown" }),
        });
      } catch {
        // ignore send failures — non-critical
      }
    }
  }

  private async poll(): Promise<void> {
    try {
      const resp = await fetch(
        `${this.apiBase}/getUpdates?offset=${this.lastUpdateId + 1}&timeout=1`
      );
      if (!resp.ok) return;

      const data = (await resp.json()) as { ok: boolean; result: TelegramUpdate[] };
      if (!data.ok || !data.result.length) return;

      for (const update of data.result) {
        this.lastUpdateId = update.update_id;
        if (update.message) await this.handleUpdate(update.message);
      }
    } catch {
      // network failure — retry next poll
    }
  }

  private async handleUpdate(
    msg: NonNullable<TelegramUpdate["message"]>
  ): Promise<void> {
    const chatId = msg.chat.id;
    const from = String(msg.from?.id ?? chatId);
    const text = msg.text ?? "";

    if (!text.trim()) return;

    if (
      this.config.allowedChatIds &&
      this.config.allowedChatIds.length > 0 &&
      !this.config.allowedChatIds.includes(chatId)
    ) {
      await this.sendMessage(chatId, "You are not authorized to use this bot.");
      return;
    }

    if (!this.rateLimiter.isAllowed(from)) {
      await this.sendMessage(chatId, "Rate limit exceeded. Please wait a minute.");
      return;
    }

    const inbound: InboundMessage = {
      id: randomUUID(),
      channel: "telegram",
      from,
      text,
      timestamp: new Date(msg.date * 1000).toISOString(),
      metadata: { chatId, username: msg.from?.username, firstName: msg.from?.first_name },
    };

    if (this.handler) {
      try {
        const response = await this.handler(inbound);
        await this.sendMessage(chatId, response);
      } catch (err) {
        await this.sendMessage(
          chatId,
          `Error: ${err instanceof Error ? err.message : "Unknown error"}`
        );
      }
    }
  }

  private chunkMessage(text: string, maxLen: number): string[] {
    if (text.length <= maxLen) return [text];
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += maxLen) {
      chunks.push(text.slice(i, i + maxLen));
    }
    return chunks;
  }
}
