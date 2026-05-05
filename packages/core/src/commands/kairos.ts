import type { SlashCommand } from "./SlashCommand.js";

export const kairosCommand: SlashCommand = {
  name: "kairos",
  description: "Manage Kairos scheduled tasks. Usage: /kairos [list|status|add|cancel]",
  async execute(args, ctx) {
    const subcommand = args[0];
    const rest = args.slice(1);

    // Late-import to avoid hard dep if daemon not running
    const pkg = "@cowork/kairos";
    const mod = await import(pkg);
    const client = new mod.KairosClient();

    if (!client.isDaemonRunning()) {
      ctx.print("Kairos daemon is not running.");
      ctx.print("");
      ctx.print("Start it with:");
      ctx.print("  bun run apps/kairos-daemon/src/index.ts");
      ctx.print("");
      ctx.print("Or enable it in .env: COWORK_KAIROS_ENABLED=true");
      return;
    }

    try {
      await client.connect();

      switch (subcommand ?? "list") {
        case "list": {
          const tasks = await client.list() as any[];
          if (tasks.length === 0) {
            ctx.print("No scheduled tasks.");
            return;
          }
          ctx.print("Scheduled tasks:");
          for (const t of tasks) {
            const next = t.nextRunAt ? `next: ${t.nextRunAt.slice(0, 16)}` : "";
            ctx.print(`  ${t.status.padEnd(10)} ${t.name.padEnd(20)} [${t.kind}] ${next}`);
          }
          break;
        }

        case "status": {
          const status = await client.status();
          ctx.print("Kairos daemon status:");
          ctx.print(`  Running: ${status.running}`);
          ctx.print(`  Tasks:   ${status.tasks}`);
          ctx.print(`  PID:     ${status.pid}`);
          break;
        }

        case "cancel": {
          const taskId = rest[0];
          if (!taskId) {
            ctx.print("Usage: /kairos cancel <taskId>");
            return;
          }
          const cancelled = await client.cancel(taskId);
          ctx.print(cancelled ? `Task ${taskId} cancelled.` : `Task ${taskId} not found.`);
          break;
        }

        default:
          ctx.print("Usage: /kairos [list|status|cancel <id>]");
      }
    } catch (err) {
      ctx.print(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      await client.disconnect();
    }
  },
};
