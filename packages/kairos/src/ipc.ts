import { join } from "node:path";
import { homedir } from "node:os";

export type IpcMessageKind =
  | "ping"
  | "schedule"
  | "cancel"
  | "list"
  | "status"
  | "shutdown";

export interface IpcMessage {
  kind: IpcMessageKind;
  id: string;
  payload?: unknown;
}

export interface IpcResponse {
  ok: boolean;
  id: string;
  data?: unknown;
  error?: string;
}

export const DAEMON_SOCK_PATH = join(
  homedir(),
  ".cowork",
  "kairos",
  "daemon.sock"
);

export const DAEMON_PID_PATH = join(
  homedir(),
  ".cowork",
  "kairos",
  "daemon.pid"
);
