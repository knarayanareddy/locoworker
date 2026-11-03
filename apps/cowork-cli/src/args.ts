// apps/cowork-cli/src/args.ts
// Strict CLI parsing: unknown flags are reported instead of silently ignored.

export interface ParsedArgs {
  prompt?: string;
  provider?: string;
  model?: string;
  permission?: string;
  maxTurns?: number;
  yes: boolean;
  json: boolean;
  help: boolean;
  version: boolean;
  sessionName?: string;
  resume?: string;
  mcpConfig?: string;
  enableGraphify: boolean;
  sandbox?: string;
  unknownFlags: string[];
}

const VALUE_FLAGS = new Set([
  "--provider", "--model", "--permission", "--max-turns",
  "--session", "--resume", "--mcp-config", "--sandbox",
]);
const BOOL_FLAGS = new Set([
  "--help", "-h", "--version", "-v", "--yes", "-y", "--json", "--enable-graphify",
]);

export function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  const result: ParsedArgs = {
    yes: false, json: false, help: false, version: false,
    enableGraphify: false, unknownFlags: [],
  };
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--") {
      positional.push(...args.slice(i + 1));
      break;
    }
    if (arg.startsWith("-") && !BOOL_FLAGS.has(arg) && !VALUE_FLAGS.has(arg)) {
      result.unknownFlags.push(arg);
      continue;
    }
    switch (arg) {
      case "--help": case "-h":   result.help = true; break;
      case "--version": case "-v": result.version = true; break;
      case "--yes": case "-y":    result.yes = true; break;
      case "--json":              result.json = true; break;
      case "--enable-graphify":   result.enableGraphify = true; break;
      case "--provider":   result.provider   = args[++i]; break;
      case "--model":      result.model      = args[++i]; break;
      case "--permission": result.permission = args[++i]; break;
      case "--sandbox":    result.sandbox    = args[++i]; break;
      case "--max-turns":  result.maxTurns   = Number(args[++i]); break;
      case "--session":    result.sessionName = args[++i]; break;
      case "--resume":     result.resume     = args[++i]; break;
      case "--mcp-config": result.mcpConfig  = args[++i]; break;
      default:
        if (!arg.startsWith("-")) positional.push(arg);
    }
  }

  if (result.maxTurns !== undefined && (!Number.isInteger(result.maxTurns) || result.maxTurns < 1)) {
    result.unknownFlags.push("--max-turns (must be a positive integer)");
    result.maxTurns = undefined;
  }
  if (positional.length > 0) result.prompt = positional.join(" ");
  return result;
}

export const HELP = `
cowork — Locoworker CLI

USAGE
  cowork [options] [prompt]
  cowork --resume <session-id> [prompt]

OPTIONS
  --provider <name>     Provider: anthropic | openai | ollama | lmstudio | deepseek | openrouter
  --model <name>        Model name
  --permission <mode>   read-only | constrained | standard | elevated | full | dangerous
  --sandbox <mode>      none | docker | podman (requires a local container runtime)
  --max-turns <n>       Max agent turns (default: 50)
  --yes / -y            Auto-approve all tool calls (opt-in; off by default)
  --json                Output NDJSON event stream
  --session <name>      Name for this session
  --resume <id>         Resume a previous session by ID (loads transcript context)
  --mcp-config <path>   Path to MCP servers JSON config file
  --enable-graphify     Enable Graphify knowledge-graph tools
  --help / -h           Show this help
  --version / -v        Show version

SECURITY
  Tool calls that need approval are denied in non-interactive mode unless --yes
  is given. Project-local .cowork/settings.json cannot raise permissions, set
  API keys/base URLs, or register MCP servers; use ~/.cowork/settings.json.

ENV VARS
  ANTHROPIC_API_KEY, OPENAI_API_KEY, DEEPSEEK_API_KEY, OPENROUTER_API_KEY
  OLLAMA_BASE_URL, LMSTUDIO_BASE_URL
  COWORK_PROVIDER, COWORK_MODEL, COWORK_PERMISSION_MODE, COWORK_HOME
  COWORK_MAX_TURNS, COWORK_MAX_TOKENS, COWORK_CONTEXT_WINDOW
  COWORK_EMBEDDER_URL, COWORK_EMBEDDER_MODEL, COWORK_EMBEDDER_API_KEY
  COWORK_SANDBOX_MODE, COWORK_SANDBOX_ENABLED, COWORK_SANDBOX_ALLOWLIST
  COWORK_GATEWAY_AUTH_TOKEN, COWORK_GATEWAY_WEBHOOK_SECRET
  COWORK_HERMES_AUTH_TOKEN, COWORK_DASHBOARD_AUTH_TOKEN
  See .env.example for the complete, validated list.

SLASH COMMANDS (REPL)
  /help                    List commands
  /exit | /quit            Exit
  /clear                   Clear screen
  /memory [type] [limit]   List memory entries
  /memory-search <query>   Search memory
  /memory-clear <type> <id> Delete a memory entry
  /dream [--with-model]    Run AutoDream consolidation
  /session list            List recent sessions
  /session show <id>       Show session details
  /session delete <id>     Delete a session
  /skill list              List available skills
  /skill <name> [input]    Invoke a skill

SKILLS
  Skills are .md files in ~/.cowork/skills/ or <project>/.cowork/skills/
  with optional frontmatter (name, description, tags). Use {{INPUT}} for input.
`;
