/**
 * IPC client for talking to a running kairos-daemon process.
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

import {
  DAEMON_SOCK_PATH,
  type IpcMessage,
  type IpcResponse,
  type IpcMessageKind,
} from "../ipc.js";

export class KairosClient {
  private socket: Awaited<ReturnType<typeof Bun.connect>> | null = null;
  private pending = new Map<string, {
    resolve: (v: IpcResponse) => void;
    reject: (e: Error) => void;
  }>();
  private buffer = "";

  isDaemonRunning(): boolean {
    return existsSync(DAEMON_SOCK_PATH);
  }

  async connect(): Promise<void> {
    if (!this.isDaemonRunning()) {
      throw new Error(
        "Kairos daemon is not running. Start it with: bun run apps/kairos-daemon/src/index.ts"
      );
    }

    const self = this;

    this.socket = await Bun.connect({
      unix: DAEMON_SOCK_PATH,
      socket: {
        data(_socket, data) {
          self.buffer += data.toString();
          const lines = self.buffer.split("\n");
          self.buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const resp = JSON.parse(line) as IpcResponse;
              const pending = self.pending.get(resp.id);
              if (pending) {
                self.pending.delete(resp.id);
                if (resp.ok) pending.resolve(resp);
                else pending.reject(new Error(resp.error ?? "IPC error"));
              }
            } catch {
              // malformed line
            }
          }
        },
        error(_socket, err) {
          for (const { reject } of self.pending.values()) reject(err);
          self.pending.clear();
        },
      },
    });
  }

  async disconnect(): Promise<void> {
    this.socket?.end();
    this.socket = null;
  }

  async ping(): Promise<{ pong: boolean; pid: number }> {
    const resp = await this.send("ping", {});
    return resp.data as { pong: boolean; pid: number };
  }

  async list(): Promise<unknown[]> {
    const resp = await this.send("list", {});
    return resp.data as unknown[];
  }

  async schedule(opts: unknown): Promise<unknown> {
    const resp = await this.send("schedule", opts);
    return resp.data;
  }

  async cancel(taskId: string): Promise<boolean> {
    const resp = await this.send("cancel", { taskId });
    return (resp.data as { cancelled: boolean }).cancelled;
  }

  async status(): Promise<{ running: boolean; tasks: number; pid: number }> {
    const resp = await this.send("status", {});
    return resp.data as { running: boolean; tasks: number; pid: number };
  }

  async shutdown(): Promise<void> {
    await this.send("shutdown", {});
  }

  private send(kind: IpcMessageKind, payload: unknown): Promise<IpcResponse> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error("Not connected to kairos daemon"));
        return;
      }
      const id = randomUUID();
      this.pending.set(id, { resolve, reject });
      const msg: IpcMessage = { kind, id, payload };
      this.socket.write(JSON.stringify(msg) + "\n");

      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`IPC timeout for ${kind}`));
        }
      }, 10_000);
    });
  }
}
