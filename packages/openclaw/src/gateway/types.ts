export type MessageChannel = "telegram" | "http" | "websocket";
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
  authToken?: string;
  allowedSenders?: string[];
}

export type MessageHandler = (message: InboundMessage) => Promise<string>;
