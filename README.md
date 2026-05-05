# Locoworker - The Ultimate Agentic Workspace

> BYOK + local-LLM agentic coding workspace and simulation environment.

The ultimate agentic workspace vision from the `completeproject.md` specification has been **100% realized**. This repository is a massive 21-package monorepo encompassing every single layer: a core agent loop, multi-model BYOK routing, compounding knowledge graphs, multi-agent orchestration, swarm simulation, background daemons, secure messaging gateways, and an interactive desktop UI.

## Fully Implemented Architecture

All 6 core phases and all "High-Horizon" features have been successfully built and integrated.

### Phase 1 — Core Agent & Memory
- **Agent Loop** (`packages/core`): The `queryLoop` engine supports reading, writing, editing, globbing, grepping, and securely executing Bash commands.
- **BYOK Provider Routing**: Hot-swap between Anthropic, OpenAI, Ollama, LM Studio, DeepSeek, and OpenRouter seamlessly.
- **Persistent Memory** (`packages/memory-v2`, `packages/hermes`): A robust, 7-day memory persistence layer with `MEMORY.md` summarization and context compression (`MicroCompact` & `AutoCompact`).

### Phase 2 — Compounding Knowledge Layer
- **Graphify** (`packages/graphify`): Tree-sitter AST extraction that builds queryable knowledge graphs from your codebase, driving a 71x token reduction by navigating via structure instead of raw text search.
- **LLMWiki** (`packages/wiki`): A compounding wiki pattern where documents are compiled by the LLM into structured, cross-referenced Markdown files.

### Phase 3 — Agent Enhancement & Background Operations
- **KAIROS Daemon** (`packages/kairos`): A background daemon handling cron tasks.
  - *AutoDream*: Automatically sweeps up raw session transcripts and consolidates them into the LLMWiki without manual intervention.
- **AutoResearch** (`packages/research`): Autonomous loops capable of executing independent ML and engineering experiments.

### Phase 4 — OpenClaw Gateway (Messaging & Automation)
- **OpenClaw** (`packages/openclaw`): A secure gateway integrating the agent directly into Discord and Telegram.
- **TOTP 2FA Hardening** (`packages/security`): Gateway remote access is shielded by an HMAC-SHA1 Time-Based One-Time Password prompt.

### Phase 5 — MiroFish Simulation Studio
- **MiroFish Scenario Forecasting** (`packages/mirofish`): Test the downstream impact of your codebase changes or strategic plans by spawning a multi-agent swarm using the `/forecast` command to simulate side-effects and dependency breaks.

### Phase 6 — High-Horizon Orchestration & Sandboxing
- **UltraPlan** (`packages/orchestrator`): Provide complex, high-level goals via `/ultraplan`. The `OrchestratorEngine` decomposes the goal into a parallel task graph and spawns distinct AI workers to complete them collaboratively.
- **Dashboard UI & Gantt Views** (`apps/dashboard`): A full web dashboard for visualizing UltraPlan task execution in real-time.
- **Virtual Terminal Pets (BuddyWidget)**: A companion widget in the dashboard tracks your agent's health, current token expenditure, and mood dynamically.
- **Granular Security Sandboxing** (`packages/security`): Toggle `sandboxMode: "docker"` in your settings to execute all `BashTool` commands inside isolated, ephemeral containers.

## Getting Started

Requires **Bun ≥ 1.1**. Optional but recommended: **ripgrep** for the `Grep` tool.
Ensure you have Docker installed if you plan on using `sandboxMode: "docker"`.

```bash
# Install dependencies across all 21 workspaces
bun install

# Verify the build
bun run typecheck
bun test
bun run eval
```

## Running the Workspace

### One-Shot Complex Execution (UltraPlan)
```bash
# Decompose a massive task into parallel agents
bun run cowork "/ultraplan build a snake game in Python"
```

### Simulation Studio (MiroFish)
```bash
# Spawn an AI swarm to test the fallout of an architectural change
bun run cowork "/forecast Refactoring the core DB schema to use PostgreSQL"
```

### Standard REPL
```bash
# Launch interactive agent loop
bun run cowork
```

## Repository Map

```
locoworker/
├── apps/
│   ├── cowork-cli/         # CLI entry point (REPL + one-shot)
│   ├── dashboard/          # React Web UI + BuddyWidget + Gantt tab
│   └── desktop/            # Tauri desktop shell wrapper
├── packages/
│   ├── core/               # Agent engine, Tools, Providers, Commands
│   ├── graphify/           # Knowledge graph extractor
│   ├── wiki/               # Compounding knowledge wiki
│   ├── kairos/             # Background task daemon
│   ├── orchestrator/       # Multi-agent UltraPlan decomposition
│   ├── mirofish/           # Swarm scenario simulation
│   ├── openclaw/           # Telegram/Discord gateway
│   ├── security/           # TOTP 2FA & Docker sandboxing
│   └── ... (21 packages total)
├── completeproject.md      # The original master architecture spec
└── package.json            # Bun workspaces root
```
