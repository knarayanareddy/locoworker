# Security review — post-merge hardening refresh

**Date:** 2026-11-03
**Target:** `main` @ `43584eb` (PR #1 merged), then the follow-up work on branch `arena/f17dd9a4-locoworker`
**Status:** P0 items implemented and verified; P1/P2 residual risks tracked below
**Companion documents:** `TOOLING_CURRENCY.md` (dependency/tooling audit), and an internal full-detail red-team report that is deliberately gitignored because it contains working exploit payloads.

> This document is PR-safe: it describes findings and fixes at the level of
> trust boundaries, not reproducible attack payloads. No exploit details were
> published to a pull request.

---

## 1. Summary

A fresh OWASP Top 10 2021 / OWASP LLM Top 10 / CWE review of the merged build
found **15 issues (7 High, 6 Medium, 2 Low)**. Most were **coverage gaps**, not
broken primitives: the PR #1 controls were correct but only applied at two of
five tool-execution choke points and to one of eight outbound HTTP call sites.

No default-reachable, unauthenticated remote code execution was found. Baseline
verification on the merged build was clean (`typecheck` clean, 81 tests passing).

All five P0 fix groups from the review are now implemented:

1. A single `executeTool()` choke point with a real recursive JSON-Schema
   validator (`ajv`), wired through every agent loop.
2. `O_NOFOLLOW` / `O_EXCL`-style state writers that refuse symlinks and never
   `chmod` a re-resolved path.
3. A shared `guardedFetch()` with complete IANA special-use IP classification,
   DNS pinning, redirect control and response caps, used by every outbound call.
4. `GraphifyBuild` reclassified as a gated side-effecting tool, plus a reviewed
   tool-manifest guard that runs in CI.
5. Child-process env allowlist, container-env fix, sensitive-path denylist,
   untrusted project-context framing, auth backoff, webhook replay protection,
   Host/origin validation, CSP and security headers, and Electron IPC allowlists.

---

## 2. Findings and status

Severity accounts for reachability: some High findings lived in shipped-but-
unwired exports (one import away from exposure), consistent with the earlier
review's convention.

| ID | Sev | Finding | Status |
|----|-----|---------|--------|
| R-01 | High | Alternate agent loops bypassed input validation and the permission gate | **Fixed** — all loops use `executeTool`; CI test forbids direct `tool.execute` |
| R-02 | High | SSRF controls applied only to `HttpFetch`; marketplace / voice / telemetry / embedder / Telegram fetches were unguarded | **Fixed** — `guardedFetch` used everywhere; plugin downloads require HTTPS and are size-capped |
| R-03 | High | IPv6 classification incomplete (NAT64, 6to4, Teredo, ORCHID, benchmarking, IPv4-translated); DNS rebinding TOCTOU | **Fixed** — full special-use list, pinned DNS answers, allowlist on by default |
| R-04 | High | Private state writers followed symlinks and `chmod`'ed the target | **Fixed** — symlink/non-regular-file refusal, fd-based chmod, guarded state roots |
| R-05 | High | `GraphifyBuild` declared `READ_ONLY` but writes two files, and is registered by the CLI | **Fixed** — `STANDARD` + approval; manifest regression test |
| R-06 | High | Bash is unrestricted; `filterEnv` was a denylist; container mode inherited the parent env; `--yes` auto-approval | **Fixed (env + container)** — strict env allowlist, explicit env in all modes, configurable pinned container image. `--yes` remains an explicit operator choice |
| R-07 | High | No auth throttling; HMAC replay; Host-derived origin; token in `localStorage`; no CSP | **Fixed** — exponential failed-auth cooldown, webhook replay cache + optional timestamp/nonce HMAC, Host allowlist, CSP/`nosniff`/`Referrer-Policy`/`X-Frame-Options`, Electron IPC URL/path allowlists and CSP |
| R-08 | Medium | Project settings could redirect provider/model and inflate limits | **Fixed** — those keys are now untrusted; numeric budgets clamped |
| R-09 | Medium | `Read` could read secrets inside the project root; project context was prompt-injectable | **Fixed** — sensitive filename/directory denylist; `CLAUDE.md` / memory framed as untrusted data |
| R-10 | Medium | `validateToolInput` was shallow (no nested/enum/union/format/size checks) | **Fixed** — Ajv with bounded structural pre-check (depth/node/size/cycle limits) |
| R-11 | Medium | No request/session/stream limits | **Partial** — `guardedFetch` caps response bytes and enforces timeouts; gateway session/outbox maps and SSE connections remain unbounded |
| R-12 | Medium | Electron IPC open operations unvalidated; no CSP; Vite bound `0.0.0.0` | **Fixed** — scheme/path allowlists, CSP, loopback bind by default |
| R-13 | Medium | MCP / marketplace / template supply chain | **Partial** — marketplace downloads hardened; MCP command allowlisting, detached plugin signatures and disabling template `postInstall` remain open |
| R-14 | Low | Latent extended tools shipped; no CI guard on registered tool list | **Fixed** — reviewed manifest test (names, levels, approval flags, default registration) |
| R-15 | Low | Error/log/scrubber hygiene; TOTP replay | **Partial** — dashboard errors no longer echo internal exceptions; log-schema validation, scrubber over-redaction and TOTP step tracking remain open |

---

## 3. What holds (verified against the merged build, then re-verified after fixes)

- `JsonQuery` no longer evaluates JavaScript; no `new Function` remains.
- Gateway identity is derived from the token; outbox IDOR and rotating-`from`
  rate-limit bypass regressions stay closed.
- Private IPv4/host bypass classes from the first review remain denied.
- File modes (0600/0700) and scrub-before-truncate are correct.
- `assertSafeId` on sessions, memory and marketplace IDs.
- Loopback binds, mandatory tokens, constant-time comparison, HMAC raw-body
  verification, fail-closed `PermissionGate`, symlink-aware path containment,
  strict CLI flag parsing, generated state excluded from git.

---

## 4. Residual risks (P1 / P2)

**P1**

- **R-11:** gateway `userSessions` / `outboxes` maps and Hermes `/sse` streams
  have no LRU/TTL or connection cap; `AuditLog.read()` still parses the whole
  NDJSON file before slicing; dashboard log export is unbounded.
- **R-13:** MCP stdio servers are spawned from a config file with
  `{ ...process.env, ...config.env }`, tool descriptions are injected verbatim,
  plugin bundles are not signature-verified, template `postInstall` still runs
  via `bash -c`.
- **Project settings:** `apiKey`/`baseUrl` and other sensitive keys are blocked,
  but `~/.cowork/settings.json` remains fully trusted (by design).

**P2**

- **R-15:** log-event schema validation, `safeMetadata` cycle detection,
  scrubber over-redaction, TOTP used-step tracking.
- **Webhook migration:** replay protection is active for all senders; only
  senders that add `x-cowork-timestamp` + `x-cowork-nonce` get the extended
  timestamped HMAC. Legacy raw-body HMAC remains accepted for compatibility.
- **DNS pinning:** `guardedFetch` pins validated addresses for the connection.
  Calls that intentionally target user-configured local endpoints use an
  explicit `allowPrivate` opt-out; those URLs must never come from a model or a
  repository.
- **`--yes`:** auto-approval is still available as an explicit CLI flag; it
  should not be used on untrusted repositories.
- **Tooling:** TypeScript 7, Vite 8 and the provider SDK majors are still
  deferred (see `TOOLING_CURRENCY.md` § Implementation status). Electron was
  upgraded to a supported line.

---

## 5. Verification

| Check | Result |
|-------|--------|
| `bun install --frozen-lockfile --ignore-scripts` | clean; repo-local security scanner runs on install |
| `bun run typecheck` (`tsc -b` + frontend + desktop) | 0 errors |
| `bun test` | **107 pass / 0 fail / 452 assertions across 16 files** |
| New regression suites | `tool-manifest.test.ts`, `p0-2026-hardening.test.ts`, `p0-2026-network.test.ts` |
| `bun run scan` (`bun pm scan`) | no advisories; self-test confirmed a fatal rule aborts the scan |
| `bun run sbom` | CycloneDX 1.6 SBOM with 513 components |
| `bun run build:graph` | 343 files / 1531 nodes / 2099 edges |
| `bun run cowork --help` | ok; unknown flag still exits 2 |
| Local PoCs (harmless, from `/tmp`) | 18 IPv6/SSRF bypass URLs denied; symlink writes refused; replayed webhook rejected; crafted Host rejected; marketplace loopback download blocked |

Regression tests assert the **security property** (refusal before execution or
before a write), not just the happy path.

---

## 6. Recommendations

1. Add LRU/TTL caps to gateway session/outbox maps, SSE connection limits,
   bounded tail reads for audit logs and a size cap on log export (R-11).
2. Require explicit approval per MCP server, allowlist MCP executables, pass an
   allowlisted env, add timeouts/line caps, treat descriptions as untrusted
   data, verify detached plugin signatures and disable template `postInstall`
   by default (R-13).
3. Validate parsed log events, add cycle detection to `safeMetadata`, track
   last-accepted TOTP step, and cap attempts (R-15).
4. Keep `security/advisories.json` and the SBOM under review as part of
   dependency upgrades; consider feeding the SBOM to a live OSV scanner in CI.
5. Plan the deferred major upgrades with a dedicated migration PR (TypeScript 7,
   Vite 8 / plugin-react 6, provider SDK majors).
