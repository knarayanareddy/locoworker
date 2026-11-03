# Production-Readiness Remediation Plan

**Branch:** `arena/d76b55f1-locoworker` (fixed for this session)
**Baseline:** `main` @ `7169e36` — PR #1 and #2 merged; 8/8 GitHub Actions runs `success`; `verify` job all 14 steps green.
**Date:** 2026-11-03
**Trigger:** the "is it production ready?" verdict — CI is green, but five blocker classes remain.

> **Execution status (2026-11-03):** D1–D6 **LOCKED** (see §1 and
> `docs/STATUS.md`). **Phases A and B are complete** — all checkboxes in §3 and
> §4 are done; 42 new Phase B regression tests bring the suite to 175 tests,
> and `docs/STATUS.md` carries the verification evidence for both phases.
> Phases C–H are still pending.
>
> Originally a plan only: work through the remaining phases in order; every
> phase ends with a green local run before anything is pushed.

---

## 0. Target posture and definition of "near production ready"

"Production ready" is unbounded unless the deployment posture is fixed. This plan
targets:

> **A single-user, local-first agent CLI + loopback-bound gateway/dashboard/desktop
> on a trusted machine, with an explicitly opted-in, token-protected non-loopback
> bind for a trusted LAN. Reproducible builds, signed release artifacts, bounded
> resource use, and a continuously scanned dependency graph.**

It does **not** target an internet-facing, multi-tenant service. If that is the
goal, this plan is insufficient: it would additionally need TLS termination,
per-user identity/tenancy isolation, a real session store, a secret manager,
centralised rate limiting/WAF, HA/backup, and an audit trail with retention
policy. Lock this decision at **D1** before work starts.

### Exit gates (all must be true)

| # | Gate | Measurable evidence |
|---|------|---------------------|
| G1 | No open P1 finding in `SECURITY_REVIEW.md` §4 | R-11, R-13 and the auth/approval rows marked **Fixed**, each with a linked regression test |
| G2 | Every new control has a *negative* test | new test files listed in §12; `bun test` count rises above 107 pass / 452 assertions |
| G3 | CI verifies what it ships | jobs for `build:all`, `vite build`, Electron packaging, HTTP integration, offline eval — not just `--help` |
| G4 | Electron 45 is actually launched/packaged | packaging job artifact + `--version` smoke, from a job that does **not** use `--ignore-scripts` |
| G5 | Dependency scanning catches new CVEs | scheduled OSV scan over all 513 SBOM components, not a 3-rule offline policy |
| G6 | Actions pinned to immutable commits | no `@v…` tags in any workflow; exact SHAs from §6.3 |
| G7 | Release is reproducible and reversible | tagged release with SBOM + provenance, `CHANGELOG.md`, `docs/ROLLBACK.md`, version bumped off `0.1.0` |
| G8 | Documentation matches the code | zero stale claims (§8 checklist); a `docs/STATUS.md` go/no-go sheet dated at verification time |
| G9 | Residual risks are *signed off* | accepted-risk register (§11) has an owner + rationale + date for every remaining row |

### Explicitly out of scope (tracked, not forgotten)

- TypeScript 7, Vite 8 / plugin-react 6, provider SDK majors, frontend minor bumps — **deliberate deferrals** in `TOOLING_CURRENCY.md` §0; each needs its own migration PR. Being one or two majors behind is tech debt, not a release blocker, once the OSV scan covers the locked versions.
- Restoring the 14 root transcripts or the 24 duplicate `docs/` frontend copies deleted in PR #1 — **do not restore**; that removal is an explicit standing decision.
- Publishing the exploit-detail `RED_TEAM_REVIEW.md` (gitignored) or any PoC payload to a PR/issue. `SECURITY_REVIEW.md` stays the PR-safe summary.
- Implementing Discord, Tauri, tree-sitter AST parsing or gateway TOTP auth. These are either absent or deliberately labelled — see **G-phase D1/D2** for the "ship or honestly hide" decision.

---

## 1. Decision gates — ✅ LOCKED 2026-11-03

All six recommended defaults below were accepted by the user and are recorded
as binding decisions in `docs/STATUS.md` §1. Locking a decision does **not**
mean its code has shipped: C/D/E implement D2/D3/D4/D6, Phase A already
respects D1 and D5.

| ID | Decision | Recommended default | Why it matters |
|----|----------|---------------------|----------------|
| **D1** | Target posture | Local-first single-user (§0) | Determines whether R-11 caps are "hardening" or "business-critical" |
| **D2** | Legacy raw-body webhook HMAC | **Strict by default; legacy only for loopback with a deprecation warning + sunset date** | Breaking change for existing senders; needs an explicit migration note |
| **D3** | `--yes` | Keep the flag, but **scope it**: never auto-approve `DANGEROUS`/`requiresApproval` Bash-class tools, require `COWORK_ALLOW_AUTO_APPROVE=1`, loud stderr warning | Removes the "one flag disables the entire approval model" footgun without breaking scripts |
| **D4** | Bash sandbox default | Keep `none` for interactive local use, but **deny unsandboxed Bash for non-interactive/gateway/desktop sessions** unless `COWORK_ALLOW_UNSANDBOXED_BASH=1`; pin the image by digest | Changing the global default breaks every existing container-less workflow |
| **D5** | Release strategy | **One branch, phased commits, one PR** (branch name is fixed for this session); optionally open/merge a PR per phase, then `git merge origin/main` back into this branch before the next | Avoids creating/pushing another branch, which this session forbids |
| **D6** | Live-provider eval | Keep **out of the required gate**; add an offline mock-engine eval to CI, and a manual/scheduled workflow with secrets for real providers | A provider-backed `bun run eval` is still unverified and must not gate a release |

---

## 2. Sequencing, effort and regression risk

| Phase | Scope | Size | Regression risk | Depends on |
|-------|-------|------|-----------------|------------|
| **A** | R-11 resource limits | M | Medium (touches gateway + dashboard hot paths) | D1 |
| **B** | R-13 supply chain | L | Medium–High (MCP/plugin/template behaviour changes) | A (shares `filterEnv`, `guardPath`) |
| **C** | Auth / approval / Bash defaults | M | Medium (breaking changes for some senders/scripts) | D2, D3, D4 |
| **D** | R-15 hygiene | S | Low | A (shares audit parsing) |
| **E** | CI verification depth | M | Low (CI only, but will *expose* existing packaging defects) | A–D |
| **F** | Supply-chain scanning in CI | M | Low | E (needs the SBOM job) |
| **G** | Release engineering / product honesty | M | Low | E, F |
| **H** | Documentation drift + final gate | S | None | all |

**Recommended order:** A → B → C → D in one local working session with a green
`bun test` after each; then E → F; then G → H. Land as 4 commits in one PR
(`A+B`, `C+D`, `E+F`, `G+H`) so each commit is independently reviewable.

### Mapping the five blockers to phases

| Blocker from the verdict | Phase(s) | Exit evidence |
|--------------------------|----------|---------------|
| 1. P1 security gaps (R-11, R-13, legacy HMAC, `--yes`, unsandboxed Bash, R-15) | A, B, C, D | G1, G2, §11 register |
| 2. Verification gaps (no packaging/build/eval/integration, Ubuntu-only) | E | G3, G4 |
| 3. Supply-chain coverage (offline 3-rule scanner, unscanned SBOM, tag pins, 17/771 packages) | F, E | G5, G6 |
| 4. Product maturity (`0.1.0`, stubs, fixture panels, no release/observability) | G | G7, G8 |
| 5. Documentation drift | H | G8 |

---

## 3. Phase A — R-11: bound every unbounded structure

**Goal:** no unbounded in-memory map, no whole-file log parse, no unbounded
export, no unbounded SSE connection or request body. Cap values must come from
**trusted environment/config**, never from project-local settings
(`packages/core/src/state/Settings.ts` already treats those as untrusted).

### A1. Shared bounded container

- [x] Add `packages/security/src/utils/BoundedMap.ts`: `maxEntries`, `maxBytes`
      (approximate, via a size estimator), `ttlMs`, LRU-on-read, eviction counter,
      and `pruneExpired()` on write. Export from `packages/security/src/index.ts`
      and add the `..security` project reference where needed.
- [x] Add `packages/security/test/bounded-map.test.ts`: eviction at cap, TTL expiry,
      byte-cap eviction, LRU ordering, eviction counter, no unbounded growth after
      10k inserts.

### A2. Gateway session and outbox maps

- [x] `packages/openclaw/src/CoworkGateway.ts:29` — replace `private userSessions = new Map(...)` with `BoundedMap`. Keep the existing per-session `historyTurns * 2` cap at `:57-61`. Add `maxSessions` (default 1 000) and `sessionTtlMs` (default 30 min) to `CoworkGatewayConfig`.
- [x] `packages/openclaw/src/gateway/GatewayServer.ts:30` — replace `outboxes` with `BoundedMap`. Keep the existing 50-message per-principal cap at `:213-214`; add a global principal cap and TTL.
- [x] Add trusted env knobs to `.env.example` and read them in the server constructors: `COWORK_MAX_SESSIONS`, `COWORK_SESSION_TTL_MS`, `COWORK_MAX_OUTBOX_PRINCIPALS`, `COWORK_OUTBOX_TTL_MS`. Document that these are operator-level, not project-level.
- [x] Counter/telemetry hook: log evictions at a low rate so an operator can see pressure without reading internal state.

### A3. SSE and MCP stdio stream bounds

- [x] `packages/hermes/src/server/HermesServer.ts:125` `handleSse()` — add `maxSseConnections` (default 32), idle timeout + heartbeat, `cancel()` cleanup, honour `req.signal`, and close the controller on abort. Return `429`/`503` with `Retry-After` when the cap is hit. Add fields to `HermesConfig` (`packages/hermes/src/server/types.ts`).
- [x] `HermesServer.ts:157` `handleHttpMessage` — enforce a `Content-Length` check and a streaming byte cap before `req.json()`; return `413`.
- [x] `GatewayServer.ts:126` — `MAX_TEXT_LENGTH = 8_000` is checked at `:140`/`:183` **after** `await req.json()`. Reject oversized bodies *before* parsing (header check + bounded reader); keep the 413.
- [x] `packages/core/src/mcp/McpStdioClient.ts` — `drainBuffer()` currently does `this.buffer += chunk` with no cap, and `request()` has **no timeout**, so `this.pending` can grow forever. Add `maxLineBytes` (e.g. 1 MiB), a per-request timeout (e.g. 30 s) that rejects and deletes the pending entry, a `maxPending` cap, and `disconnect()` cleanup on process exit.
- [x] Add `packages/hermes/test/sse-limits.test.ts` and `packages/core/test/mcp-timeouts.test.ts`: N+1 SSE connection refused, idle connection closed, oversized body 413, oversized stdout line rejected, timed-out request rejected and pending map drained.

### A4. Bounded audit reads and export

- [x] `packages/security/src/audit/AuditLog.ts:41` `read()` — replace the "read every `.ndjson` file in full then `slice()`" behaviour with a **bounded reverse tail**: sort files descending, open with `node:fs/promises` `open()` + `read()` from the end in fixed-size chunks (e.g. 64 KiB), stop once `limit` valid events or a `maxScanBytes` budget (e.g. 8 MiB) is reached. Never allocate more than the budget.
- [x] Validate each parsed line against a bounded `AuditEvent` schema while reading (reuse the Ajv pattern from `packages/core/src/tools/validateToolInput.ts`); skip malformed/oversized lines rather than trusting `as AuditEvent`.
- [x] Cap the number of files scanned per call and expose `readTail(limit, maxScanBytes)` explicitly. Keep `read(0)` behaviour for compatibility but route it through the bounded implementation.
- [x] `apps/dashboard/src/DashboardRouter.ts:213` (`audit: (await log.read(0)).length`) — replace with a cheap `countRecent(limit)` or a capped count; never materialise the full log for a dashboard stat.
- [x] `apps/dashboard/src/DashboardRouter.ts:265` `/api/audit/export` — cap rows (e.g. 5 000) and response bytes, add `Cache-Control: no-store`, and stream/paginate instead of `JSON.stringify(entries)` over the whole history. Keep `/api/audit`'s existing `Math.min(..., 1000)` cap at `:113`.
- [x] Add `packages/security/test/audit-tail.test.ts` with a synthetic 20 MiB NDJSON log: assert peak memory stays bounded, only the newest N events are returned, malformed lines are skipped, and the export response is capped.

### A5. Phase A acceptance

**Implementation notes / honest deviations (2026-11-03):**

- All checkboxes above are implemented and covered by tests. No new `..security`
  tsconfig references were needed — every consumer already referenced that
  project; the new module is imported via `@cowork/security/utils`.
- The load smoke uses **3 SSE connects against a cap of 2** (N+1 refusal) plus
  **10 000 inserts** into `BoundedMap`; it does not open 10 000 live SSE
  sockets. The invariant tested is the same (`activeSse ≤ maxSseConnections`).
- `/api/actions/export-logs` is bounded by a **row cap + serialised-byte cap**
  with a `truncated` response header rather than true streaming/pagination.
  Streaming remains available as a later optimisation; the memory bound is
  already enforced.
- The large-log test uses an **8 MiB** file with a **128 KiB** scan budget
  (a stricter bound than the 20 MiB example) and asserts `bytesRead ≤ budget`.
- MCP `config.env` still spread `process.env` at the end of Phase A; this was
  **closed in Phase B (B1)** — see §4. Phase A only bounded the client's
  buffers and pending requests.

- [x] **Load smoke:** 10 000 distinct sender sessions → map size never exceeds `maxSessions`; 10 000 SSE connect attempts → ≤ cap concurrent; 20 MiB log → bounded read; all return a defined response (no OOM, no hang).
- [x] `bun run typecheck` 0 errors; `bun test` all green with ≥3 new test files.
- [x] `SECURITY_REVIEW.md` R-11 row → **Fixed** with the new test paths.

---

## 4. Phase B — R-13: close the supply-chain execution paths

**Goal:** no code executes from a config file, registry response, or template
without explicit operator consent, a bounded environment, and (where applicable)
a verified signature.

### B1. MCP stdio servers

- [x] `packages/core/src/mcp/McpStdioClient.ts:32-34` — replace `env: { ...process.env, ...this.config.env }` with `filterEnv(process.env)` (`packages/security/src/env/SensitiveEnv.ts:36`) **plus** an allowlist-filtered `config.env`; reject `NODE_OPTIONS`, `LD_PRELOAD`, `PATH` overrides, credential-shaped keys and non-string values.
- [x] Add an executable allowlist: `COWORK_MCP_ALLOWED_COMMANDS` (default **empty = deny all**), resolve the binary to an absolute path, reject shell strings/metacharacters, keep `shell: false`, and confine `cwd` to the project root via `guardPath`.
- [x] Require an explicit consent gate before starting any server: `COWORK_MCP_ALLOW_SERVERS` (comma-separated names) or an interactive approval; emit a warning listing the command + args when skipping.
- [x] Add connect/initialize timeout, stdout line cap, pending-request cap and process-exit cleanup (shared with A3).
- [x] Tests in `packages/core/test/mcp-hardening.test.ts`: parent credentials absent from child env, non-allowlisted command refused, `NODE_OPTIONS` stripped from `config.env`, unconsented server skipped, timeout cleans `pending`.

### B2. MCP tool metadata is untrusted data

- [x] `packages/core/src/mcp/buildMcpTools.ts` — the `description` is injected verbatim into the model prompt (`:33`). Wrap in explicit untrusted-data delimiters, cap length (e.g. 2 000 chars), strip control characters and prompt-injection markers; add a `COWORK_MCP_UNTRUSTED_DESCRIPTIONS` note in docs.
- [x] Validate `mcpTool.inputSchema` with Ajv before use (currently `as any` spread into `inputSchema`); reject schemas that are not objects, exceed depth/size limits, or contain `$ref`/remote references.
- [x] Set `requiresApproval: true` for MCP tools by default and cap the number of tools per server / total; prefix collisions must be detected. Consider a lower default `permissionLevel` than `STANDARD` for a first-run server.
- [x] Add a manifest-guard case to `packages/core/test/tool-manifest.test.ts` so MCP tools cannot silently bypass `executeTool`.

### B3. Plugin signature verification

- [x] `packages/marketplace/src/MarketplaceClient.ts:60-119` `install()` — HTTPS + `guardedFetch` + 1 MiB cap + `guardPath` are already in place. Add **detached signature verification before any write**: require `entry.signature` + a pinned trusted public key from `~/.cowork/config` (never from the registry response); fail closed when missing/invalid. Ed25519 via `node:crypto` keeps it dependency-free.
- [x] Verify the declared `sha512` integrity against the downloaded bytes and record it in `manifest.json`; re-verify at load time in `packages/plugins/src/PluginManager.ts`.
- [x] Write through `appendPrivateFile`/`secureFile` (`O_NOFOLLOW`, 0600/0700) rather than a plain `Bun.write`; reject symlinked entrypoints and `../`; record the trusted key fingerprint in the manifest.
- [x] Add `packages/marketplace/test/install-signature.test.ts` with a local HTTPS-free fixture (stub the fetch layer) — unsigned, wrong-key, hash-mismatch and symlink cases all return `success: false` and write nothing.

### B4. Templates / `postInstall`

- [x] `packages/templates/src/Scaffolder.ts:42-48` — `postInstall` currently runs `Bun.spawn(["bash","-c",cmd])` with inherited stdio and no timeout. Default `allowPostInstall: false` in `ScaffoldOptions`; only run when explicitly opted in **and** approved. Replace `bash -c` with an argv-array spawn, allowlisted binaries, `env: filterEnv(process.env)`, `cwd` confined to `targetDir`, per-command timeout (e.g. 60 s), bounded stdout/stderr, and non-zero exit propagation into `ScaffoldResult`.
- [x] `Scaffolder.ts:18` — `path.join(opts.targetDir, this.substitute(file.path, ...))` has **no traversal guard**; a template with `../../.env` escapes the target. Apply `guardPath` (and symlink refusal) to every generated path. This is an additional P1-class finding worth tracking in `SECURITY_REVIEW.md`.
- [x] Cap file count, per-file size and total bytes; refuse absolute paths and symlinks in the target dir.
- [x] Add `packages/templates/test/scaffolder.test.ts`: `../` path rejected, `postInstall` skipped by default, non-allowlisted command refused, timeout enforced, credentials absent from child env.

### B5. Phase B acceptance

**Implementation notes / honest deviations (2026-11-03):**

- All checkboxes above are implemented and covered by negative tests. Phase B
  adds **42 tests**: `mcp-hardening.test.ts` (13),
  `install-signature.test.ts` (12), `plugin-manager.test.ts` (4),
  `scaffolder.test.ts` (12), plus one MCP guard case in
  `tool-manifest.test.ts`. Full suite: **175 pass / 0 fail / 712 assertions /
  25 files**.
- MCP descriptions are **always** framed as untrusted data; there is no
  `COWORK_MCP_UNTRUSTED_DESCRIPTIONS` opt-out toggle, because an opt-out would
  reintroduce the injection path. The bound is exposed as
  `COWORK_MCP_MAX_DESCRIPTION_CHARS` and documented in `.env.example` /
  `README.md`.
- MCP tools stay at `PermissionLevel.STANDARD` but are unconditionally
  `requiresApproval: true`; a separate lower permission level was not needed to
  guarantee an approval prompt.
- Trusted plugin keys come from an explicit caller option,
  `COWORK_PLUGIN_TRUSTED_KEY`, or `~/.cowork/plugin-keys.json` (rather than
  `~/.cowork/config`), so a registry response can never nominate its own key.
  Bundles are written with whole-file `writePrivateFile` (`O_NOFOLLOW`, 0600);
  `appendPrivateFile` is append-only and unsuitable for code.
- Signature verification is **not** plugin sandboxing. Plugin code is verified
  at install and load time but is not executed in this release; an isolated
  runtime remains deferred.
- The `cwd` of an MCP child is the trusted `projectRoot` supplied by the CLI (or
  `process.cwd()`), not a value from the MCP config, so `guardPath` is applied
  to template/plugin paths rather than to the MCP cwd.
- `packages/templates` now depends on `@cowork/security` and `packages/plugins`
  on `@cowork/core`, `@cowork/security` and `@cowork/marketplace`; the matching
  tsconfig project references were added and `bun.lock` was regenerated.
- The "no spawn inherits raw `process.env`" guard is a source-scan test with
  **one documented exception**: `apps/desktop/src/main.ts` spawns its own
  first-party dashboard server with the full parent env (see
  `SECURITY_REVIEW.md` §4 P2). Every config-driven spawn uses `filterEnv` or
  `buildMcpEnv`.
- The new template path-traversal finding is tracked as **R-16** in
  `SECURITY_REVIEW.md` §2 and marked **Fixed**.


- [x] No `spawn`/`Bun.spawn` call site inherits raw `process.env` (grep guard added to CI or a test).
- [x] `SECURITY_REVIEW.md` R-13 row → **Fixed** (or split into "Fixed / accepted with owner"), including the new traversal finding.
- [x] All new tests green; `bun run typecheck` 0 errors.

---

## 5. Phase C — auth, approval and execution defaults

### C1. Strict webhook HMAC (D2)

- [ ] `packages/security/src/network/HttpGuard.ts:247-278` `verifyWebhookSignature()` — add a `strict` mode that **requires** `x-cowork-timestamp` + `x-cowork-nonce` (payload `timestamp.nonce.rawBody`) and the `WebhookReplayCache`. Reject legacy raw-body HMAC when `strict` is on.
- [ ] Default `strict = true` for non-loopback binds; keep legacy on loopback with a one-time deprecation warning and a documented sunset date (e.g. next minor release). Wire the mode through `GatewayServer` (`COWORK_WEBHOOK_STRICT_HMAC`).
- [ ] Extend `packages/security/test/security.test.ts` and `packages/openclaw/test/gateway.test.ts`: raw-body HMAC rejected in strict mode, replayed nonce rejected, skewed timestamp rejected, loopback legacy accepted only with the warning.
- [ ] Document sender migration (two headers + timestamped HMAC) in `README.md` and `.env.example`.

### C2. `--yes` scope (D3)

- [ ] `apps/cowork-cli/src/args.ts:27,51,88`, `repl.ts:74`, `session.ts:158` — keep the flag but refuse to auto-approve tools with `permissionLevel >= DANGEROUS` or `requiresApproval` on Bash-class tools; require `COWORK_ALLOW_AUTO_APPROVE=1` for non-interactive use; print a loud warning listing what is being auto-approved.
- [ ] Add `apps/cowork-cli/test/yes-guard.test.ts`: `--yes` still denies `requiresApproval` + dangerous tools, refuses without the env gate in non-interactive mode, and never auto-approves when `COWORK_PERMISSION_MODE=full|dangerous`.

### C3. Bash execution default (D4)

- [ ] `packages/core/src/tools/bash/BashTool.ts:63` — default `sandboxMode` is `"none"`. Keep it for interactive CLI, but deny unsandboxed Bash for **non-interactive, gateway and desktop** contexts unless `COWORK_ALLOW_UNSANDBOXED_BASH=1`; make the denial message actionable.
- [ ] `:71` — `COWORK_BASH_IMAGE` defaults to the mutable tag `ubuntu:24.04`. Ship a **digest-pinned** default and add a CI check that the value contains `@sha256:`; keep the container hardening already present (`--network none`, `--cap-drop ALL`, `--read-only`, `--pids-limit`, `--memory`, `no-new-privileges`).
- [ ] Add `packages/core/test/bash-defaults.test.ts` with a stubbed spawn to assert the flags and the gateway/non-interactive denial.

### C4. Remote-bind posture

- [ ] Document/enforce: loopback is the supported default; `COWORK_BIND_HOST` non-loopback requires a ≥16-char token **and** `COWORK_ALLOW_REMOTE=1` **and** strict webhook HMAC. Add a startup warning that no TLS is provided by the app (requires a reverse proxy).
- [ ] Add a test that a non-loopback bind without the gate fails closed.

---

## 6. Phase D — R-15 hygiene (small, low risk)

- [ ] `AuditEvent` schema validation on **write** as well as read: bounded field lengths, enum of `AuditEventKind`, no prototype keys; reuse the Ajv helper.
- [ ] `packages/security/src/scrub/SecretScrubber.ts:52` `safeMetadata()` — add `WeakSet` cycle detection plus depth/node/size caps; assert it cannot be used to smuggle unbounded objects into logs.
- [ ] Scrubber over-redaction: add a regression table of false positives (UUIDs, sha512 hex, ISO dates, ordinary words like "token" in prose); keep secret patterns intact; document intentional behaviour.
- [ ] `packages/security/src/TOTP.ts:107` `verify()` — record the last accepted step per instance and reject reuse within the same window; add a bounded attempt counter/lockout (also useful if TOTP is ever wired into a gateway).
- [ ] Add `packages/security/test/hygiene.test.ts` covering all four; update the R-15 row in `SECURITY_REVIEW.md` to **Fixed**.

---

## 7. Phase E — make CI verify what actually ships

**Current state:** `.github/workflows/ci.yml` is a single `verify` job on
`ubuntu-latest`, installs with `--ignore-scripts` (explicitly skipping the
Electron binary), then typecheck → test → `build:graph` → `cowork --help`.
Nothing is built, packaged or launched.

### E1. Pin actions to immutable SHAs (G6)

Resolved 2026-11-03 via `git ls-remote` (all lightweight tags → commit SHAs):

| Action | Current | Pin to |
|--------|---------|--------|
| `actions/checkout` | `@v7.0.1` | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| `oven-sh/setup-bun` | `@v2.2.0` | `0c5077e51419868618aeaa5fe8019c62421857d6` |
| `actions/upload-artifact` | `@v4` (**floating** = v4.6.2) | `ea165f8d65b6e75b540449e92b4886f43607fa02` |

- [ ] Replace all three with `owner/repo@SHA # vX.Y.Z` comments; add a CI grep step that fails on any remaining `uses: .*@v[0-9]`.
- [ ] Add `permissions: contents: read` at workflow level, `concurrency` group, and `timeout-minutes` on every job.

### E2. Split the workflow into jobs

- [ ] `verify` (unchanged fast gate): frozen install, `bun run scan`, `bun run sbom` + upload, `typecheck`, `bun test`, `build:graph`, CLI smoke.
- [ ] `build`: `bun run build:all` (`tsc -b` emitting every workspace `dist/`), `bun run --cwd apps/dashboard-frontend build` (`vite build`), plus a check that each expected `dist/` entry exists. Upload frontend + SBOM artifacts.
- [ ] `integration`: start `GatewayServer` / `HermesServer` on an ephemeral port and exercise auth, rate limits, webhook strict HMAC, SSE cap, `/api/audit` cap and `/api/audit/export` cap over real HTTP (reuse `packages/openclaw/test/gateway.test.ts` patterns). No live provider.
- [ ] `cli-smoke`: `--help`, `--version`, `--json` one-shot with a deterministic stub engine, `--bogus` → exit 2, `--resume` against a fixture transcript.
- [ ] `eval-offline`: a `MockQueryEngine` implementing `QueryEngine`'s interface so `bun run eval --ci` runs **without API keys**; keep real-provider eval in a separate manual/scheduled workflow with secrets labelled "unverified" (D6).

### E3. Actually package Electron 45 (G4) — expect this to fail first

- [ ] New `package-desktop` job: install **with postinstall scripts enabled** (do not reuse `--ignore-scripts`), `bun run --cwd apps/desktop build` scoped to `--linux` on Linux, upload `dist-electron/` artifacts.
- [ ] Fix defects the packaging job will surface:
  - `apps/desktop/electron-builder.json` `files: ["src/**/*","assets/**/*"]` **omits `dist/**/*`** while `main` is `dist/main.js` → packaged app would be broken.
  - Icon paths (`assets/icon.icns`, `.ico`, `.png`) reference a directory that does not exist in the repo → either add real assets or remove the icon keys.
  - `apps/desktop/package.json` `build` runs `--mac --win --linux` on one host; make it platform-conditional (linux on Ubuntu, dmg/nsis only on their native runners).
- [ ] Add a smoke: `electron --version`, and (if feasible under `xvfb-run`) launch the packaged app with `--no-sandbox` under a short timeout; at minimum verify the AppImage extracts and contains `dist/main.js` + `resources/app.asar` with the expected Electron version.
- [ ] Add `--publish never` and `--config.publish=never` so CI never publishes by accident.

### E4. Matrix and caching

- [ ] Typecheck + unit tests on `ubuntu-latest` and `macos-latest` (add `windows-latest` only if the path handling is verified — `secureFile`/`guardPath` are POSIX-oriented). Packaging per native OS in a separate release workflow.
- [ ] Cache `~/.bun/install/cache` keyed on `bun.lock`; keep `bun-version: "1.4.4"` pinned.

### E5. Phase E acceptance

- [ ] Every job green; `verify` is no longer the only job.
- [ ] A CI run produces a real Electron 45 artifact and a real frontend `dist/`; `bun run eval --ci` passes offline.
- [ ] Evidence recorded in `docs/STATUS.md` (run URL + artifact names), not just a badge.

---

## 8. Phase F — real supply-chain coverage

- [ ] **Live OSV scan of the SBOM (G5).** Add `scripts/osv-scan.ts`: read `sbom.cdx.json`, extract the 513 `purl` values (`scripts/sbom.ts:43` already writes them), batch-query `https://api.osv.dev/v1/querybatch`, map to `/v1/vulns` for details, fail on High/Critical, warn on Medium, and print a summary. Alternative: SHA-pin `google/osv-scanner-action` against `--sbom=sbom.cdx.json`; prefer the in-repo script (no new action trust, easier to unit-test with a fixture response).
- [ ] Add `bun run osv` script and a CI step in `verify` that runs it against the freshly generated SBOM. **Fail closed** on network errors for `schedule`/`push` to `main`; for PRs, surface a warning rather than blocking contributors on an upstream outage (document the difference).
- [ ] Add `on: schedule: cron: "17 3 * * *"` so **new** CVEs are caught after merge — this is the gap the offline 3-rule policy cannot close.
- [ ] Add `.github/dependabot.yml` for `npm` (grouped minor/patch, weekly) and `github-actions` (SHA-pinned updates), so `security/advisories.json` and action pins have a maintenance owner.
- [ ] `security/advisories.json` — add `"owner"` and `"reviewCadenceDays": 30` fields; add a CI step that prints policy age and fails if `updatedAt` is >90 days stale (so the offline policy cannot silently rot).
- [ ] Add a check that SBOM component count equals the number of resolved packages in `bun.lock` (guards against a parser regression silently dropping transitive deps). This closes the "17 of 771 packages" caveat in `TOOLING_CURRENCY.md` §Caveats.
- [ ] Unit-test `osv-scan.ts` with a fixture containing a known-vulnerable purl and an empty response; assert exit codes and that a network error is handled per policy.
- [ ] Update `TOOLING_CURRENCY.md` §0 and `SECURITY_REVIEW.md` §6 item 4 from "consider feeding the SBOM to OSV" to **Done**.

---

## 9. Phase G — release engineering and product honesty (G7)

- [ ] **D1/D2 product decision, recorded in `docs/STATUS.md`:** for each of Discord, Tauri, tree-sitter, gateway TOTP, `packages/plugins` stub, and the React/Vite dashboard — either implement it, or remove/relabel it so the shipped surface contains **no silent stubs**. README already says "experimental", but "production" requires a crisp "not shipped" list.
- [ ] `apps/dashboard-frontend/src/components/` — 11 components import `../data/mockData` (`Dashboard`, `Memory`, `Gateway`, `Commands`, `Kairos`, `GitWorkflow`, `Research`, `Security`, `Sessions`, `Simulation`, `Wiki`). Either wire them to the real `/api/*` endpoints (only `Dashboard.tsx:48` currently calls `/api/analytics`) or hide them behind an explicit `COWORK_DEMO_UI=1` flag with a visible "demo data" banner. Add a CI grep that fails if `mockData` is imported outside demo-gated files.
- [ ] Versioning: bump off `0.1.0` → `1.0.0-rc.1` (or `0.2.0`); add `CHANGELOG.md`, a semver/compatibility policy, and a `docs/RELEASING.md` checklist. Keep `private: true` until the package is actually publishable.
- [ ] `release.yml` on `v*.*.*` tags: run all E-phase jobs, generate SBOM, sign/attest artifacts (`actions/attest-build-provenance` SHA-pinned), attach AppImage/deb + SBOM + checksums to a GitHub Release, and record the commit SHA. Dry-run the workflow with `workflow_dispatch` before tagging.
- [ ] `docs/ROLLBACK.md`: state lives in `~/.cowork/` (settings, sessions, audit NDJSON, memory, plugins) — document backup, restore, config migration and how to roll back to the previous tag; include the "what is not restored" list.
- [ ] Optional `Dockerfile` for the gateway: multi-stage, Bun 1.4.4 pinned by digest, non-root user, read-only rootfs, no secrets in layers, healthcheck. Only if D1 includes container deployment — otherwise skip and say so.
- [ ] Observability: structured log levels + request IDs, bounded log rotation, `/health` for dashboard and gateway (Hermes already has one at `HermesServer.ts:104`), and counters for rate-limit hits, bounded-map evictions, OSV findings. No external telemetry by default (`COWORK_TELEMETRY_ENABLED=false` already).
- [ ] Third-party notices generated from the SBOM for the MIT LICENSE distribution.

---

## 10. Phase H — documentation drift and the final gate

- [ ] `README.md:30` — change "the public-host allowlist is opt-in via `COWORK_SANDBOX_ENABLED`" to the truth: **enabled by default, opt out with `COWORK_SANDBOX_ENABLED=false`** (`NetworkSandbox.ts:197`). Also fix `README.md:29` if container-default wording changed in C3.
- [ ] `SECURITY_REVIEW.md` §5 — the `build:graph` row says `343 files / 1531 nodes / 2099 edges`; the final verified run was `345 / 1540 / 2108`. Either regenerate the numbers from the actual release run or (better) replace volatile counts with "✓ passes" and link the CI run, so the doc cannot drift again.
- [ ] `SECURITY_REVIEW.md` §4 — mark R-11/R-13/R-15 and the auth/approval rows as Fixed/Partial/Accepted with a test path; remove the "legacy HMAC remains accepted" wording once C1 lands (or move it to §11 with an owner).
- [ ] `TOOLING_CURRENCY.md` §0 — update implementation status; keep §§3–5 as the intentional 2026-11-03 pre-upgrade snapshot; mark the "transitive packages not matched" caveat resolved by Phase F.
- [ ] `.env.example` — add every new knob from A–C with a comment naming the file that reads it (the header already promises "every variable below is actually read by the code"; keep that invariant).
- [ ] Create `docs/STATUS.md`: go/no-go sheet with the G1–G9 gates, verification date, CI run URL, artifact hashes, and the accepted-risk register links.
- [ ] `CONTRIBUTING.md` — add the "every security control needs a negative test" rule and the local verification commands from §12.

---

## 11. Per-change definition of done (apply to every checkbox above)

- [ ] Code change is minimal and lands behind a **trusted** config knob (env/global config, never project-local settings).
- [ ] A **negative** regression test exists that proves refusal/limiting *before* the side effect (write, spawn, network call or allocation).
- [ ] `bun run typecheck` → 0 errors; `bun test` → 0 fail; test count and assertion count both increase.
- [ ] `bun run scan` clean; `bun run sbom` still generates a valid CycloneDX file; `bun run build:graph` and CLI smoke still pass.
- [ ] `.env.example`, `README.md`, `SECURITY_REVIEW.md` and (if relevant) `TOOLING_CURRENCY.md` updated in the **same commit**.
- [ ] No secret, token, key, transcript, generated `dist/`/`graphify-out/`/`sbom.cdx.json`, or exploit payload staged (`git diff --cached --name-only` reviewed; `.gitignore` covers generated artifacts).
- [ ] `RED_TEAM_REVIEW.md` stays gitignored and unpublished; PR bodies stay PR-safe.
- [ ] `git diff --check` clean; commit message names the finding ID (R-11/R-13/…) and the tests added.

---

## 12. Final go/no-go checklist

**Security**
- [ ] G1: `SECURITY_REVIEW.md` §4 has no open P1 row; R-11/R-13/R-15 = Fixed or Accepted with owner.
- [ ] Strict webhook HMAC on by default for non-loopback; legacy path sunset documented.
- [ ] `--yes` cannot auto-approve dangerous tools; unsandboxed Bash denied for non-interactive/gateway/desktop.
- [ ] MCP, plugins and templates require consent + bounded env + signature/allowlist; template path traversal closed.
- [ ] Load smoke: 10k sessions / 10k SSE attempts / 20 MiB audit log → bounded, no OOM or hang.

**Verification**
- [ ] G2: new negative tests in ≥7 new test files; `bun test` green and count > 107.
- [ ] G3/G4: CI has `verify`, `build`, `integration`, `cli-smoke`, `eval-offline`, `package-desktop`; Electron 45 artifact built and launched/verified.
- [ ] Matrix includes ≥2 OSes; every job has a timeout and `permissions: contents: read`.

**Supply chain**
- [ ] G5: scheduled OSV scan over all 513 SBOM components; fail-on-High/Critical; policy-age check.
- [ ] G6: zero `@v…` action tags; SHAs from §7/E1; Dependabot configured for npm + actions.
- [ ] `security/advisories.json` has an owner and review cadence; SBOM component count asserted against `bun.lock`.

**Release**
- [ ] G7: version bumped, `CHANGELOG.md`, `docs/RELEASING.md`, `docs/ROLLBACK.md`, tag-based release workflow with SBOM + provenance, dry-run completed.
- [ ] G8: `docs/STATUS.md` dated; zero stale README/SECURITY_REVIEW numbers; no silent stubs or demo data on the default UI.
- [ ] G9: every accepted risk in §13 below has an owner, rationale and date.

**Final command suite (must all exit 0)**

```bash
export PATH=/tmp/bunenv/node_modules/.bin:$PATH   # system bun is absent in this sandbox
bun install --frozen-lockfile --ignore-scripts
bun run typecheck
bun test
bun run scan
bun run sbom
bun run osv                 # new; needs network in CI
bun run build:all
bun run --cwd apps/dashboard-frontend build
bun run --cwd apps/desktop build -- --linux --publish never
bun run build:graph
bun run eval --ci          # offline mock engine
bun run cowork --help
bun run cowork --bogus     # expect exit 2
git diff --check
```

Record the actual numbers (tests, assertions, SBOM components, graph counts,
artifact hashes) in `docs/STATUS.md` rather than hardcoding them into narrative
docs — that is what caused the current drift.

---

## 13. Accepted-risk register (fill in at the end)

| Risk | Phase that closes it | If accepted: owner | Rationale | Date |
|------|----------------------|--------------------|-----------|------|
| R-11 unbounded structures | A | — | must be Fixed for G1 | — |
| R-13 supply-chain execution | B | — | must be Fixed for G1 | — |
| Legacy raw-body HMAC | C | — | D2 decides | — |
| `--yes` auto-approval | C | — | D3 decides | — |
| Unsandboxed Bash default | C | — | D4 decides | — |
| R-15 log/TOTP hygiene | D | — | low severity, but cheap | — |
| Deferred TS7 / Vite8 / SDK majors | out of scope | maintainer | migration PRs; OSV covers locked versions | 2026-11-03 |
| Live-provider eval unverified | E (offline) / D6 | maintainer | needs configured provider + secrets | 2026-11-03 |
| Internet-facing multi-tenant posture | out of scope | — | D1 excludes it | 2026-11-03 |
| Action SHA pinning for third-party *new* actions | F/E | maintainer | each new action pinned at introduction | — |

---

## 14. Execution constraints / known pitfalls (from prior work)

- **Branch discipline:** all work stays on `arena/d76b55f1-locoworker`; never create/switch/push another branch. If a per-phase PR is merged, `git fetch origin main && git merge origin/main` back into this branch before the next phase.
- **Toolchain:** system `bun` is absent here; use `PATH=/tmp/bunenv/node_modules/.bin:$PATH` (npm-installed Bun 1.4.4). Use `--ignore-scripts` for the general install (Electron postinstall fails on the sandbox certificate), and a **separate** job without it for packaging.
- `bun.lock` is JSONC with trailing commas — strip them before `json.loads`; `sbom.cdx.json`, `dist/`, `graphify-out/`, `.cowork/` are generated and gitignored.
- `MemorySystem` takes `{ projectRoot: string }`, not a bare string.
- Test-guard gotcha: `tool-manifest.test.ts` had to exclude `test/` dirs and strip comments before regex, otherwise it flagged its own comment containing `tool.execute`. Reuse that pattern for any new source-scanning guard.
- Settings: project-local `settings.json` is untrusted (`validateSettings` ignores provider/model/limits/flags). **New caps must be operator/env-level**, or an attacker could raise the very limit you just added.
- Do not restore the deleted transcripts/duplicate docs; do not publish exploit details; do not retry provider-backed `bun run eval` without a configured provider.
- `CI` is the repo's only workflow (ID `405558053`) and is currently 8/8 green — any new job must not silently weaken the existing `verify` gate.
