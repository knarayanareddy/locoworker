# Locoworker

> BYOK + local-LLM agentic coding workspace.

This implements **Phases 1–2** of the build described in
`completeproject.md`: a working agent CLI with provider routing, tool
execution, a permission gate, plus a complete memory architecture
(memdir + hybrid search + AutoDream + context compression). Subsequent
phases (knowledge graph, wiki, desktop app, KAIROS daemon, multi-agent
orchestration, simulation studio) build on this.

## What works today

### Phase 1 — Core agent

- **Agent loop** — async-generator `queryLoop` that runs the model,
  executes tool calls, and feeds results back until the task is complete.
- **BYOK provider routing**:
  - Anthropic (`claude-*` models) via the official SDK
  - OpenAI-compatible endpoints — covers OpenAI, Ollama, LM Studio,
    DeepSeek, OpenRouter, and any other OpenAI-shape API
- **Six built-in tools** — `Read`, `Write`, `Edit`, `Glob`, `Grep`, `Bash`
- **Six-level permission gate** — read-only / constrained / standard /
  elevated / full / dangerous, with explicit-approval support for
  dangerous operations
- **Bash security** — hard blocklist (`rm -rf /`, fork bombs, raw disk
  writes), null-byte / zero-width / IFS injection detection, output
  truncation, configurable timeout
- **Settings cascade** — defaults → `~/.cowork/settings.json` →
  `<project>/.cowork/settings.json` → environment → CLI flags
- **CLI** — both one-shot and interactive REPL, with optional
  newline-delimited JSON event stream

### Phase 2 — Memory & compression

- **memdir** — file-based persistent memory at
  `~/.cowork/projects/<project>/memory/` with four typed buckets
  (`user`, `feedback`, `project`, `reference`), YAML frontmatter on
  every entry, and a hard-capped 200-line `MEMORY.md` index that's
  auto-loaded into the system prompt every session.
- **CLAUDE.md** — when present at the project root, it's appended to
  the system prompt automatically.
- **Hybrid search** — BM25 keyword ranking + optional cosine
  similarity over embeddings (any OpenAI-compat `/v1/embeddings`
  endpoint, e.g. Ollama `nomic-embed-text`). Results are merged via
  Reciprocal Rank Fusion. Falls back to BM25-only if no embedder is
  configured.
- **Memory tools** — `MemorySave`, `MemorySearch`, `MemoryDelete`
  exposed to the agent for in-conversation memory ops.
- **Slash commands** — `/memory`, `/memory-search`, `/memory-clear`,
  `/dream`, `/help`, `/exit`, `/clear`, `/provider`, `/compact`.
- **AutoDream** — consolidation pass: merges duplicates, prunes stale
  entries, datestamps relative dates, rebuilds the index. Mechanical
  pass is always-safe; `/dream --with-model` adds a semantic LLM pass.
- **Context compression** — `MicroCompact` (always-on, trims large
  tool outputs locally before they enter history) + `AutoCompact`
  (model-summarized rollup near the context ceiling) with a
  three-strikes circuit breaker.
- **Transcript persistence** — every session is appended to a daily
  log in `~/.cowork/projects/<project>/transcripts/YYYY-MM-DD.md`.

## Install

Requires **Bun ≥ 1.1**. Optional but recommended: **ripgrep** (`brew install ripgrep`)
for the `Grep` tool.

```bash
bun install
```

## Run

### One-shot

```bash
# Use Anthropic
ANTHROPIC_API_KEY=sk-ant-... \
  bun run cowork --provider anthropic --model claude-sonnet-4-5 \
  "list all TypeScript files in this repo"

# Use a local model via Ollama (no API key needed)
ollama pull qwen2.5-coder:7b
bun run cowork --provider ollama --model qwen2.5-coder:7b \
  "summarize the package.json"

# Use any OpenAI-compatible endpoint
OPENAI_API_KEY=sk-... \
  bun run cowork --provider openai --model gpt-4o-mini \
  "review the README and suggest one improvement"
```

### Interactive REPL

```bash
bun run cowork
```

Type prompts at the `»` prompt. Slash commands inside the REPL: `/exit`,
`/help`, `/provider`.

### Flags

| Flag                  | Description                                                |
| --------------------- | ---------------------------------------------------------- |
| `--provider <name>`   | `anthropic` \| `openai` \| `ollama` \| `lmstudio` \| `deepseek` \| `openrouter` |
| `--model <id>`        | Model identifier (e.g. `claude-sonnet-4-5`, `qwen2.5-coder:7b`)               |
| `--permission <mode>` | `read-only` \| `constrained` \| `standard` \| `elevated` \| `full`            |
| `--max-turns <n>`     | Cap on agent loop iterations (default 50)                                     |
| `--yes`, `-y`         | Auto-approve permission prompts                                               |
| `--json`              | Emit events as newline-delimited JSON (for piping to other tools)             |

## Repo layout

```
locoworker/
├── apps/
│   └── cowork-cli/         CLI entry point (REPL + one-shot)
├── packages/
│   └── core/               Agent engine + tools + providers + permissions
│       ├── src/
│       │   ├── queryLoop.ts          async-generator agent loop
│       │   ├── QueryEngine.ts        retry/backoff wrapper around providers
│       │   ├── Tool.ts               base tool interface
│       │   ├── tools/                Bash, Read, Write, Edit, Glob, Grep
│       │   ├── providers/            Anthropic + OpenAIShim + ProviderRouter
│       │   ├── permissions/          PermissionLevel + PermissionGate
│       │   └── state/                Settings cascade
│       └── test/                     smoke tests
├── completeproject.md      Full 24-part build spec (target architecture)
├── package.json            Bun workspaces root
└── tsconfig.base.json      Shared TS config
```

## Type-check & test

```bash
bun run typecheck
bun test
```

## What's next (Phases 3–7)

Per the spec:

1. **Phase 3** — Knowledge graph (Graphify, Tree-sitter AST, Leiden clustering) + compounding wiki (LLMWiki)
2. **Phase 4** — Tauri desktop app (3-panel layout, BYOK settings UI)
3. **Phase 5** — Multi-agent orchestration + KAIROS background daemon
4. **Phase 6** — Messaging gateway (Telegram / Discord / WhatsApp) + AutoResearch loop
5. **Phase 7** — MiroFish simulation studio + final polish
