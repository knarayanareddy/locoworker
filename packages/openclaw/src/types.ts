export type ChannelType =
  | "telegram"
  | "slack"
  | "discord"
  | "webhook"
  | "cli"       // loopback for testing
  | "http";     // generic HTTP ingress

export type MessageRole = "user" | "assistant" | "system";

export interface InboundMessage {
  id: string;
  channelType: ChannelType;
  channelId: string;       // e.g. telegram chat id, slack channel id
  userId: string;
  text: string;
  attachments?: MessageAttachment[];
  replyToId?: string;
  ts: number;
  metadata?: Record<string, unknown>;
}

export interface OutboundMessage {
  channelType: ChannelType;
  channelId: string;
  text: string;
  replyToId?: string;
  parseMarkdown?: boolean;
  metadata?: Record<string, unknown>;
}

export interface MessageAttachment {
  type: "image" | "file" | "audio";
  url?: string;
  data?: string;    // base64
  mimeType?: string;
  filename?: string;
}

export interface ChannelConfig {
  type: ChannelType;
  channelId: string;
  name?: string;
  // Auth tokens etc. — loaded from env, not stored in config object
  settings?: Record<string, unknown>;
}

export interface GatewayConfig {
  projectRoot: string;
  channels: ChannelConfig[];
  httpPort?: number;          // port for HTTP ingress (default 3721)
  webhookSecret?: string;
  rateLimitPerUser?: number;  // messages per minute per userId (default 20)
}

export interface RateLimitState {
  userId: string;
  count: number;
  windowStart: number;
}
export interface CoworkGatewayConfig extends GatewayConfig {
  agentSystemPrompt?: string;
  historyTurns?: number;     // per-user history kept in memory (default 20)
}
