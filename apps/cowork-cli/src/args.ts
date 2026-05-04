// apps/cowork-cli/src/args.ts
// PHASE 5: adds --session, --resume, --mcp-config, --enable-graphify flags.

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
}

export function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  const result: ParsedArgs = {
    yes: false,
    json: false,
    help: false,
    version: false,
    enableGraphify: false,
  };

  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    switch (arg) {
      case "--help": case "-h":   result.help = true; break;
      case "--version": case "-v": result.version = true; break;
      case "--yes": case "-y":    result.yes = true; break;
      case "--json":              result.json = true; break;
      case "--enable-graphify":   result.enableGraphify = true; break;
      case "--provider":  result.provider   = args[++i]; break;
      case "--model":     result.model      = args[++i]; break;
      case "--permission": result.permission = args[++i]; break;
      case "--max-turns": result.maxTurns   = Number(args[++i]); break;
      case "--session":   result.sessionName = args[++i]; break;
      case "--resume":    result.resume     = args[++i]; break;
      case "--mcp-config": result.mcpConfig  = args[++i]; break;
      default:
        if (!arg.startsWith("-")) positional.push(arg);
    }
  }

  if (positional.length > 0) result.prompt = positional.join(" ");
  return result;
}

export const HELP = `
cowork — Locoworker CLI (Phase 5)

USAGE
  cowork [options] [prompt]

OPTIONS
  --provider <name>     Provider: anthropic | openai | ollama | lmstudio | deepseek | openrouter
  --model <name>        Model name
  --permission <mode>   read-only | constrained | standard | elevated | full | dangerous
  --max-turns <n>       Max agent turns (default: 50)
  --yes / -y            Auto-approve all tool calls
  --json                Output NDJSON event stream
  --session <name>      Name for this session (persisted to session manager)
  --resume <id>         Resume a previous session by ID (loads transcript context)
  --mcp-config <path>   Path to MCP servers JSON config file
  --enable-graphify     Enable Graphify knowledge-graph tools
  --help / -h           Show this help
  --version / -v        Show version

ENV VARS
  COWORK_PROVIDER       Default provider
  COWORK_MODEL          Default model
  COWORK_PERMISSION_MODE
  COWORK_MAX_TURNS
  COWORK_CONTEXT_WINDOW
  COWORK_EMBEDDER_URL
  COWORK_EMBEDDER_MODEL
  COWORK_EMBEDDER_API_KEY
  ANTHROPIC_API_KEY
  OPENAI_API_KEY
  DEEPSEEK_API_KEY
  OPENROUTER_API_KEY
  OLLAMA_BASE_URL
  LMSTUDIO_BASE_URL

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
  /skill show <name>       Show a skill template
  /skill <name> [input]    Invoke a skill

SKILLS
  Skills are .md files in ~/.cowork/skills/ or <project>/.cowork/skills/
  with optional frontmatter:
    ---
    name: my-skill
    description: What this skill does
    tags: refactor, review
    ---
    Your prompt template here. Use {{INPUT}} for user input.

MCP CONFIG FILE FORMAT
  JSON array of McpServerConfig objects:
  [
    { "name": "filesystem", "transport": "stdio",
      "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "."],
      "trustLevel": "standard" },
    { "name": "myapi",  "transport": "http",
      "url": "http://localhost:8080", "apiKey": "...", "trustLevel": "read-only" }
  ]
`;
