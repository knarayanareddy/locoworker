import type { ProviderName } from "@cowork/core";
import type { PermissionMode } from "@cowork/core";

export type CliArgs = {
  prompt: string | null;
  provider?: ProviderName;
  model?: string;
  permissionMode?: PermissionMode;
  maxTurns?: number;
  yes: boolean;
  json: boolean;
  help: boolean;
  version: boolean;
};

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    prompt: null,
    yes: false,
    json: false,
    help: false,
    version: false,
  };

  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") args.help = true;
    else if (a === "-v" || a === "--version") args.version = true;
    else if (a === "-y" || a === "--yes") args.yes = true;
    else if (a === "--json") args.json = true;
    else if (a === "--provider") args.provider = argv[++i] as ProviderName;
    else if (a === "--model") args.model = argv[++i];
    else if (a === "--permission") args.permissionMode = argv[++i] as PermissionMode;
    else if (a === "--max-turns") args.maxTurns = Number(argv[++i]);
    else if (a && a.startsWith("-")) {
      throw new Error(`Unknown flag: ${a}`);
    } else if (a !== undefined) {
      positional.push(a);
    }
  }

  if (positional.length > 0) args.prompt = positional.join(" ");
  return args;
}

export const HELP = `cowork — agentic coding assistant (BYOK + local LLM)

USAGE:
  cowork [options] "your prompt here"
  cowork                              # interactive REPL

OPTIONS:
  --provider <name>      anthropic | openai | ollama | lmstudio | deepseek | openrouter
  --model <id>           Override the model (e.g. claude-sonnet-4-5, qwen2.5-coder:7b)
  --permission <mode>    read-only | constrained | standard | elevated | full
  --max-turns <n>        Cap agent loop iterations (default 50)
  --yes, -y              Auto-approve permission prompts
  --json                 Emit events as newline-delimited JSON
  --help, -h             Show this help
  --version, -v          Show version

ENVIRONMENT:
  COWORK_PROVIDER, COWORK_MODEL, COWORK_PERMISSION_MODE, COWORK_MAX_TURNS
  COWORK_CONTEXT_WINDOW             Soft target for AutoCompact (default 100000)
  COWORK_EMBEDDER_URL               OpenAI-compat /v1/embeddings endpoint
  COWORK_EMBEDDER_MODEL             e.g. nomic-embed-text (Ollama)
  ANTHROPIC_API_KEY, OPENAI_API_KEY, DEEPSEEK_API_KEY, OPENROUTER_API_KEY
  OLLAMA_BASE_URL                   default http://localhost:11434/v1
  LMSTUDIO_BASE_URL                 default http://localhost:1234/v1

SLASH COMMANDS (in REPL):
  /help, /exit, /clear, /provider
  /memory [type] [limit]            list stored memories
  /memory-search <query>            hybrid search across memories
  /memory-clear <type> <id>         delete a memory
  /dream [--with-model]             run AutoDream consolidation pass

EXAMPLES:
  cowork "list all TypeScript files in src/"
  cowork --provider anthropic --model claude-sonnet-4-5 "review the README"
  cowork --provider ollama --model qwen2.5-coder:7b "summarize package.json"
`;
