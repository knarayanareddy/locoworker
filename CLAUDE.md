# locoworker — Project Intelligence

> This file is auto-loaded by locoworker into the system prompt.
> It gives the agent project-specific context and behavioral guidance.

## Project Overview

**locoworker** is a Bun + TypeScript monorepo implementing an agentic coding
workspace with:
- **Core**: Multi-provider agent loop (Anthropic/OpenAI/Ollama).
- **Memory**: Persistent episodic/semantic memory with AutoDream consolidation.
- **Graphify**: Codebase-to-knowledge-graph extraction for deep architecture awareness.
- **Kairos**: Background task scheduler and file watcher.
- **Hermes**: MCP server for exposing project tools to other agents.
- **OpenClaw**: Messaging gateway (Telegram/Discord/Webhooks).

## Tech Stack
- **Runtime**: Bun
- **Language**: TypeScript (ESM)
- **Styling**: Vanilla CSS (Modern richness)
- **Database**: Filesystem-based NDJSON/JSON (for portability)

## Development Workflow
- `bun run dev`: Start the CLI REPL
- `bun run dashboard`: Start the web dashboard
- `bun run eval`: Run regression tests
- `bun run build:graph`: Update the knowledge graph

## Code Style
- Use `node:fs/promises` for async IO.
- Use `import` with `.js` extensions (required for ESM).
- Prefer functional patterns over heavy OOP where possible.
- Always scrub secrets before logging (use `@cowork/security`).
