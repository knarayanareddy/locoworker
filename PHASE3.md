# Phase 3 — Feature Guide

Phase 3 adds multi-agent orchestration, background automation (KAIROS),
a compounding knowledge wiki (LLMWiki), an AutoResearch queue, a plugin
system, MCP server connectivity, and 18 new tools.

## New packages

| Package | Description |
|---------|-------------|
| `@cowork/kairos` | Background daemon — runs scheduled tasks (dream, digest, research, wiki sync, GC) |
| `@cowork/wiki` | LLMWiki — per-project compounding knowledge wiki |
| `@cowork/research` | AutoResearch — queued + instant background research |
| `@cowork/orchestrator` | Multi-agent orchestration — planner/executor/synthesizer |
| `@cowork/plugins` | Plugin/skill registry |

## New tools (18+)

`HttpFetch`, `JsEval`, `JsonQuery`, `DiffApply`, `TreeView`,
`TodoRead`, `TodoWrite`, `GitStatus`, `GitLog`, `GitDiff`, `GitCommit`,
`ProcessList`, `ProcessKill`, `EnvRead`, `Base64Encode`, `Base64Decode`,
`HashFile`, `TemplateRender`

Plus wiki tools: `WikiRead`, `WikiSearch`, `WikiWrite`
Plus research tools: `ResearchEnqueue`, `ResearchNow`
Plus orchestrator tool: `Orchestrate`

## New slash commands

| Command | Description |
|---------|-------------|
| `/wiki [slug]` | List or read wiki pages |
| `/research <q>` | Queue a background research job |
| `/kairos` | Show KAIROS daemon task list |
| `/graphify build` | Build the knowledge graph |

## KAIROS daemon

Enable via env: `COWORK_ENABLE_KAIROS=true`

Runs scheduled tasks:
- **Nightly Dream** (every 6h) — memory deduplication
- **Daily Digest** (every 24h) — transcript → memory
- **Transcript GC** (every 7d) — purge old transcripts
