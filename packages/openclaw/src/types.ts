export type ChannelType = "telegram" | "slack" | "discord" | "webhook" | "http";

export interface InboundMessage {
  id: string;
  channelId: string;
  channelType: ChannelType;
  senderId: string;
  senderName: string;
  text: string;
  raw?: unknown;
  ts: number;
}

export interface OutboundMessage {
  text: string;
  replyToId?: string;
  metadata?: Record<string, unknown>;
}

export interface BaseChannelConfig {
  id: string;
  type: ChannelType;
  token?: string;
}

export interface GatewayConfig {
  projectRoot: string;
  channels: BaseChannelConfig[];
  httpPort?: number;
  rateLimitPerUser?: number; // messages per minute
}
