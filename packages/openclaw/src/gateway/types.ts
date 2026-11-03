import type { ResourceLimits } from "@cowork/security/utils";

export type MessageChannel = "telegram" | "http" | "webhook" | "websocket";
export type MessageStatus = "queued" | "processing" | "complete" | "error";

export interface InboundMessage {
  id: string;
  channel: MessageChannel;
  from: string;
  text: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface OutboundMessage {
  id: string;
  inboundId: string;
  channel: MessageChannel;
  to: string;
  text: string;
  status: MessageStatus;
  timestamp: string;
}

export interface GatewayConfig {
  port: number;
  rateLimitPerMinute: number;
  /** Bearer token. Required when binding a non-loopback host. */
  authToken?: string;
  tokenEnvVar?: string;
  hostname?: string;
  /** HMAC secret for POST /webhook (X-Cowork-Signature: sha256=<hex>). */
  webhookSecret?: string;
  /**
   * Map of Bearer token -> sender identity. Each token is one principal: its
   * owner cannot claim another sender, read another outbox, or reset the rate
   * limiter by changing `from`. Tokens not listed here map to a stable hash of
   * the token.
   */
  senderTokens?: Record<string, string>;
  /** If set, only these sender IDs may send messages. */
  allowedSenders?: string[];
  /** Trusted operator-level resource limits (R-11); never read from a clone. */
  limits?: Partial<ResourceLimits>;
}

export type MessageHandler = (message: InboundMessage) => Promise<string>;
