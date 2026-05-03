import type { AgentEvent } from "@cowork/core";

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
};

export function renderEvent(event: AgentEvent, opts: { json: boolean }): void {
  if (opts.json) {
    process.stdout.write(JSON.stringify(event) + "\n");
    return;
  }

  switch (event.type) {
    case "turn_start":
      process.stdout.write(`${C.dim}── turn ${event.turn} ──${C.reset}\n`);
      break;
    case "text":
      process.stdout.write(event.text);
      break;
    case "tool_call":
      process.stdout.write(
        `\n${C.cyan}● ${event.name}${C.reset} ${C.dim}${formatInput(event.input)}${C.reset}\n`,
      );
      break;
    case "tool_result": {
      const color = event.isError ? C.red : C.green;
      const label = event.isError ? "✗" : "✓";
      const preview = truncate(event.result, 800);
      process.stdout.write(`${color}  ${label}${C.reset} ${C.dim}${preview}${C.reset}\n`);
      break;
    }
    case "permission_request":
      process.stdout.write(
        `${C.yellow}⚠ approval requested for ${event.tool}${C.reset}\n`,
      );
      break;
    case "permission_denied":
      process.stdout.write(`${C.red}✗ permission denied: ${event.tool} (${event.reason})${C.reset}\n`);
      break;
    case "compact":
      process.stdout.write(
        `${C.magenta}⤿ context compacted: ${event.before} → ${event.after} tokens${C.reset}\n`,
      );
      break;
    case "compact_skipped":
      process.stdout.write(`${C.yellow}⤿ compact skipped: ${event.reason}${C.reset}\n`);
      break;
    case "complete":
      process.stdout.write(
        `\n\n${C.dim}── done · ${event.usage.inputTokens} in / ${event.usage.outputTokens} out tokens ──${C.reset}\n`,
      );
      break;
    case "error":
      process.stdout.write(`\n${C.red}error: ${event.message}${C.reset}\n`);
      break;
  }
}

function formatInput(input: Record<string, unknown>): string {
  const entries = Object.entries(input);
  if (entries.length === 0) return "{}";
  return entries
    .map(([k, v]) => {
      const str = typeof v === "string" ? v : JSON.stringify(v);
      return `${k}=${truncate(str, 80)}`;
    })
    .join(" ");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `… [+${s.length - max} chars]`;
}
