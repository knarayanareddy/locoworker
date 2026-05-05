import type { SlashCommand } from "./SlashCommand.js";

export const hermesCommand: SlashCommand = {
  name: "hermes",
  description: "Start/stop the Hermes MCP server. Usage: /hermes [start|stop|status]",
  async execute(args, ctx) {
    const subcommand = args[0] || "status";
    const port = parseInt(process.env["COWORK_HERMES_PORT"] ?? "3100", 10);
    const transport = (process.env["COWORK_HERMES_TRANSPORT"] ?? "sse") as "stdio" | "sse";

    switch (subcommand) {
      case "status":
        try {
          const resp = await fetch(`http://localhost:${port}/health`, {
            signal: AbortSignal.timeout(1000),
          });
          if (resp.ok) {
            const data = (await resp.json()) as { tools: string[] };
            ctx.print(`Hermes MCP server is running on port ${port}`);
            ctx.print(`Exposed tools: ${data.tools?.join(", ") ?? "unknown"}`);
            return;
          }
          ctx.print(`Hermes server responded with ${resp.status}`);
        } catch {
          ctx.print(`Hermes MCP server is not running on port ${port}.`);
        }
        break;

      case "start":
        ctx.print(`To start the Hermes MCP server, run in a separate terminal:`);
        ctx.print(`  COWORK_HERMES_TRANSPORT=${transport} COWORK_HERMES_PORT=${port} bun run packages/hermes/src/start.ts`);
        ctx.print(``);
        ctx.print(`Or set COWORK_HERMES_ENABLED=true in .env to auto-start with the CLI.`);
        break;

      default:
        ctx.print("Usage: /hermes [start|stop|status]");
    }
  },
};
