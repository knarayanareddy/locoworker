import { BaseChannel } from "../BaseChannel";
import type { InboundMessage, OutboundMessage, ChannelType } from "../types";

export class TelegramChannel extends BaseChannel {
  readonly type: ChannelType = "telegram";
  readonly id: string;
  private token: string;
  private offset = 0;
  private polling = false;

  constructor(id: string, token: string) {
    super();
    this.id = id;
    this.token = token;
  }

  async start(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    void this.poll();
    console.error(`[Telegram] Channel ${this.id} started.`);
  }

  async stop(): Promise<void> {
    this.polling = false;
  }

  async send(targetId: string, message: OutboundMessage): Promise<void> {
    const url = `https://api.telegram.org/bot${this.token}/sendMessage`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: targetId,
        text: message.text,
        reply_to_message_id: message.replyToId,
      }),
    });
  }

  private async poll(): Promise<void> {
    while (this.polling) {
      try {
        const url = `https://api.telegram.org/bot${this.token}/getUpdates?offset=${this.offset}&timeout=30`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.ok && data.result.length > 0) {
          for (const update of data.result) {
            this.offset = update.update_id + 1;
            if (update.message) {
              this.emitMessage({
                id: String(update.message.message_id),
                channelId: this.id,
                channelType: this.type,
                senderId: String(update.message.chat.id),
                senderName: update.message.from?.first_name ?? "Unknown",
                text: update.message.text ?? "",
                raw: update,
                ts: Date.now(),
              });
            }
          }
        }
      } catch (err) {
        console.error(`[Telegram] Poll error:`, err);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }
}
