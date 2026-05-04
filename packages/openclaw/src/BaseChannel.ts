import { EventEmitter } from "node:events";
import type { InboundMessage, OutboundMessage, ChannelType } from "./types";

export abstract class BaseChannel extends EventEmitter {
  abstract readonly id: string;
  abstract readonly type: ChannelType;

  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract send(targetId: string, message: OutboundMessage): Promise<void>;

  protected emitMessage(message: InboundMessage): void {
    this.emit("message", message);
  }
}
