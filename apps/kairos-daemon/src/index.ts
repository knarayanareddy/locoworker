import { join } from "node:path";
import { homedir } from "node:os";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { KairosDaemon } from "@cowork/kairos";
import { resolveProvider, QueryEngine, resolveSettings, queryLoop } from "@cowork/core";
import type { IpcMessage, IpcResponse } from "./ipc.js";
import { DAEMON_SOCK_PATH, DAEMON_PID_PATH } from "./ipc.js";

async function main() {
  const cwd = process.cwd();
  const settings = await resolveSettings(cwd, process.env);

  await mkdir(join(homedir(), ".cowork", "kairos"), { recursive: true });
  await writeFile(DAEMON_PID_PATH, String(process.pid), "utf-8");

  process.stderr.write(`[kairos-daemon] Starting (pid ${process.pid})...\n`);

  const provider = resolveProvider({
    provider: settings.provider,
    model: settings.model,
    apiKey: settings.apiKey,
    baseUrl: settings.baseUrl,
    env: process.env as Record<string, string>,
  });

  const engine = new QueryEngine(provider);

  const daemon = new KairosDaemon({
    projectRoot: cwd,
    enableFileWatch: process.env["COWORK_KAIROS_FILE_WATCH"] === "true",
    onTaskPrompt: async (prompt, task) => {
      process.stderr.write(`[kairos-daemon] Firing task "${task.name}"\n`);
      let output = "";
      for await (const event of queryLoop(prompt, {
        engine,
        systemPrompt: "You are an autonomous background agent. Complete the task concisely.",
        tools: [],
        maxTurns: 5,
        requestApproval: async () => false,
      })) {
        if (event.type === "text") output += event.text;
      }
      process.stderr.write(`[kairos-daemon] Task "${task.name}" output: ${output.slice(0, 100)}\n`);
    },
  });

  await daemon.start();

  const server = Bun.listen<{ buffer: string }>({
    unix: DAEMON_SOCK_PATH,
    socket: {
      open(socket) {
        socket.data = { buffer: "" };
      },
      data(socket, data) {
        socket.data.buffer += data.toString();
        const lines = socket.data.buffer.split("\n");
        socket.data.buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          void (async () => {
            try {
              const msg = JSON.parse(line) as IpcMessage;
              const response = await handleIpc(msg, daemon);
              socket.write(JSON.stringify(response) + "\n");
            } catch (err) {
              const errResp: IpcResponse = {
                ok: false,
                id: "unknown",
                error: err instanceof Error ? err.message : String(err),
              };
              socket.write(JSON.stringify(errResp) + "\n");
            }
          })();
        }
      },
      error(_socket, error) {
        process.stderr.write(`[kairos-daemon] Socket error: ${error.message}\n`);
      },
    },
  });

  process.stderr.write(`[kairos-daemon] IPC listening on ${DAEMON_SOCK_PATH}\n`);

  process.on("SIGTERM", async () => {
    process.stderr.write(`[kairos-daemon] SIGTERM received. Shutting down.\n`);
    await daemon.stop();
    server.stop();
    if (existsSync(DAEMON_PID_PATH)) await unlink(DAEMON_PID_PATH);
    if (existsSync(DAEMON_SOCK_PATH)) await unlink(DAEMON_SOCK_PATH);
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    await daemon.stop();
    server.stop();
    if (existsSync(DAEMON_PID_PATH)) await unlink(DAEMON_PID_PATH);
    if (existsSync(DAEMON_SOCK_PATH)) await unlink(DAEMON_SOCK_PATH);
    process.exit(0);
  });
}

async function handleIpc(
  msg: IpcMessage,
  daemon: KairosDaemon
): Promise<IpcResponse> {
  switch (msg.kind) {
    case "ping":
      return { ok: true, id: msg.id, data: { pong: true, pid: process.pid } };

    case "list":
      return { ok: true, id: msg.id, data: daemon.scheduler.list() };

    case "schedule": {
      const opts = msg.payload as Parameters<typeof daemon.scheduler.schedule>[0];
      const task = await daemon.scheduler.schedule(opts);
      return { ok: true, id: msg.id, data: task };
    }

    case "cancel": {
      const { taskId } = msg.payload as { taskId: string };
      const cancelled = await daemon.scheduler.cancel(taskId);
      return { ok: true, id: msg.id, data: { cancelled } };
    }

    case "status":
      return {
        ok: true,
        id: msg.id,
        data: {
          running: daemon.isRunning(),
          tasks: daemon.scheduler.list().length,
          pid: process.pid,
        },
      };

    case "shutdown":
      await daemon.stop();
      process.exit(0);
      return { ok: true, id: msg.id }; // unreachable but satisfies TS

    default:
      return { ok: false, id: msg.id, error: `Unknown message kind` };
  }
}

main().catch((err) => {
  process.stderr.write(`[kairos-daemon] Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
