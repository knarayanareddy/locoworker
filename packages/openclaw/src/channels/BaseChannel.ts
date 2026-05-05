import type { InboundMessage, OutboundMessage, ChannelConfig } from "../types";
import { EventEmitter } from "node:events";

export abstract class BaseChannel extends EventEmitter {
  protected config: ChannelConfig;

  constructor(config: ChannelConfig) {
    super();
    this.config = config;
  }

  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract send(msg: OutboundMessage): Promise<void>;

  get channelId(): string {
    return this.config.channelId;
  }

  get channelType() {
    return this.config.type;
  }

  protected emit_message(msg: InboundMessage): void {
    this.emit("message", msg);
  }
}
