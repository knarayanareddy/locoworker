# Security review — summary and remediation status

**Date:** 2026-11-03
**Scope:** the `locoworker` monorepo after the hardening pass (PR #1), reviewed
from an OWASP Top 10 2021 / OWASP LLM Top 10 / CWE perspective. All `.ts`/`.tsx`
sources, root configuration, CI, `.env.example` and documentation were covered.
**Method:** static trust-boundary review (authentication → network → agent loop →
tools → filesystem → desktop) plus local, non-destructive proof-of-concept runs
confined to temporary directories. No live service was attacked and no user data
was read.
**Disclosure:** this is the **PR-safe, redacted** version. It describes risk
classes, locations and fixes but deliberately omits working exploit payloads.
The full report (with reproducible PoCs) is kept out of version control and is
not published in this pull request.

> This document is a point-in-time review, not a certification. Residual risks
> are listed explicitly in §4 and should be read before exposing any surface
> beyond loopback or to more than one user.

---

## 1. Executive summary

The hardening pass is real: loopback-only binds, mandatory Bearer tokens,
constant-time comparison, HMAC over raw webhook bodies, a fail-closed permission
gate, derived nested-agent policies, symlink-aware path guarding, an honest
feature matrix and a green CI job. **No default-reachable unauthenticated remote
code execution was found.**

The review produced **20 findings (8 High, 8 Medium, 4 Low)**. Residual risk was
concentrated in four areas: identity was not per-user; the agent remains an
unrestricted local code-execution primitive behind a blacklist and one approval
prompt; several "read-only"/"filtered" declarations were not enforced; and some
shipped-but-unwired modules contained direct code-execution or traversal sinks.

The five P0 items have now been remediated in this branch (§3), with 21 new
regression tests (81 total). The remaining items are tracked as P1/P2 (§4) and
are **not** claimed as fixed.

---

## 2. Findings and status

| ID | Sev | Risk (redacted description) | OWASP 2021 / LLM | CWE | Status |
|----|-----|-----------------------------|------------------|-----|--------|
| F-01 | High | An extended tool compiled model-supplied text into host JavaScript | A03, LLM05 | CWE-94 | **Fixed** — strict path walker, no dynamic evaluation |
| F-02 | High | Shared token + client-chosen sender: impersonation, cross-user outbox read, rate-limit bypass | A01, LLM02 | CWE-639, CWE-284 | **Fixed** — identity derived from credential |
| F-03 | High | SSRF: private/special-use address blocklist bypassable; no resolved-IP recheck | A10, LLM02 | CWE-918 | **Mostly fixed** — see §4 note on egress allowlist |
| F-04 | High | Conversation/audit/graph state created world-readable; partial secret scrubbing | A02, A09, LLM02 | CWE-532, CWE-276 | **Fixed** — `0600`/`0700`, scrub before truncate |
| F-05 | High | Identifiers used as filename components allowed traversal (session resume, memory delete, marketplace) | A01, A03, LLM06 | CWE-22 | **Fixed** — strict ID validation + path containment |
| F-06 | High | Auth hardening: no failed-auth throttling, webhook replay possible, browser token storage, no CSP | A07, A05, A09 | CWE-307, CWE-294, CWE-522 | **Open — P1** |
| F-07 | High | MCP / marketplace / template supply chain (unsigned remote code, unfiltered child env, no timeouts) | A08, LLM03 | CWE-829, CWE-494 | **Open — P1** |
| F-08 | High | Bash is unrestricted local execution; `--yes` removes the only interactive control; env denylist is incomplete | A05, A03, LLM06 | CWE-78, CWE-1188 | **Open — P1** |
| F-09 | Medium | Secrets inside the project root are readable; project context is prompt-injectable | A02, LLM01/02/07 | CWE-200 | **Open — P1** |
| F-10 | Medium | Some permission declarations and security claims did not match the code | A05, LLM07 | CWE-1188 | **Partially fixed** — stale docs corrected; see §4 |
| F-11 | Medium | Missing request/session/stream limits (unbounded consumption) | A04, LLM10 | CWE-770 | **Open — P2** |
| F-12 | Medium | Path containment is check-then-use (symlink TOCTOU) | A01, A03 | CWE-367 | **Open — P2** |
| F-13 | Medium | Untrusted project settings can redirect the provider and inflate limits | A01, A05, LLM10 | CWE-862 | **Open — P2** |
| F-14 | Medium | Electron IPC open operations unvalidated; HTML lacks CSP | A05, A03 | CWE-693, CWE-1021 | **Open — P1** |
| F-15 | Medium | Vite dev server binds all interfaces with no auth | A05 | CWE-1188 | **Open — P1** |
| F-16 | Medium | `inputSchema` was declarative only; tool inputs were never validated at runtime | A04, LLM05 | CWE-20 | **Fixed** — validation at tool choke points |
| F-17 | Low | Dependency/runtime hygiene (mutable image tag, unpinned actions, no audit/SBOM) | A06, LLM03 | CWE-1104 | **Open — P2** |
| F-18 | Low | Error/log/scrubber edge cases | A09 | CWE-209, CWE-117 | **Open — P2** |
| F-19 | Low | TOTP utility has no replay protection or attempt limiting | A07 | CWE-294 | **Open — P2** |
| F-20 | Low | Latent unwired extended tools contain dangerous operations | A03, A05, LLM06 | CWE-78, CWE-862 | **Open — P2** |

**Reachability caveat (important for severity):** F-01 and F-20 live in modules
that are exported but **not registered** in the default tool list, which is why
they are High rather than Critical. A future import could expose them silently;
§5 recommends a CI guard on the registered tool manifest.

---

## 3. What was fixed in this branch (P0)

### F-01 / F-16 — no dynamic evaluation; inputs validated before execution
- `packages/core/src/tools/extended/JsonQuery.ts` now walks a restricted
  dot/index path. Property lookups are own-property only and prototype-chain
  segments are rejected. No expression evaluation remains.
- New `packages/core/src/tools/validateToolInput.ts` enforces required keys,
  primitive/array/object types, `additionalProperties: false`, array item types,
  unsafe property names and oversized strings.
- Validation runs in `queryLoop` (before the permission gate and before
  `tool.execute`) and in the Hermes JSON-RPC `tools/call` dispatcher. MCP-derived
  tools flow through `queryLoop`, so their declared schemas are enforced too.
- Tests assert hostile inputs are rejected **without** invoking `execute`.

### F-02 — one token is one identity
- `HttpGuard` accepts a set of per-sender tokens and exposes the presented
  token after successful authorization.
- `GatewayConfig.senderTokens` maps a token to a sender identity. Identity is
  derived from the credential (or a stable hash of it), never from the request
  body. A request claiming a different `from` is rejected before the handler.
- Outboxes and the rate limiter are keyed on that identity; a token cannot read
  another identity's outbox, and rotating a claimed sender no longer resets the
  limit. Webhook payload sender names are retained only as untrusted metadata.
- Tests cover impersonation, outbox isolation, distinct-token buckets and the
  rate-limit bypass.

### F-03 — SSRF containment
- `NetworkSandbox` now normalizes hostnames (brackets, trailing dots, zone IDs,
  case) and classifies the full set of non-global IPv4 ranges, IPv6 loopback /
  unique-local / link-local / multicast / documentation ranges, and IPv4-mapped
  IPv6 addresses. WHATWG URL normalization is relied on for decimal/hex IPv4
  literals. Credentials-in-URL are rejected and known IP-encoding DNS suffixes
  are denied.
- `assertDnsAllowed()` re-resolves a hostname and fails closed if any answer is
  a blocked address; `HttpFetch` calls it immediately before the request, while
  keeping `redirect: "manual"`.
- Tests cover every bypass class found during the review plus a public-host
  allowlist happy path.

### F-05 — IDs and untrusted paths
- New `packages/core/src/utils/safeId.ts` validates every ID used as a filename
  component (single safe segment, no separators or dot segments).
- Applied to session resume/list/delete, memory create/load/delete and the
  marketplace plugin ID. Marketplace entrypoints from a remote registry are now
  resolved through `guardPath()` and confined to the plugin directory.
- Tests assert traversal IDs are refused before any filesystem write or unlink.

### F-04 — private state
- New `packages/security/src/audit/secureFile.ts` (re-exported from
  `@cowork/core`) provides `ensurePrivateDir` / `writePrivateFile` /
  `appendPrivateFile`, which create `0700` directories and `0600` files and
  tighten pre-existing permissions on the next write.
- Applied to audit logs, transcripts, sessions, memory/index, wiki pages, graph
  snapshots, cost/analytics ledgers, schedulers, project/episode/research state,
  REPL history, dashboard settings and daemon PID files. User-facing generated
  project files (source scaffolding, reports, audio) intentionally keep normal
  modes.
- `AuditLog` now scrubs the **full** value before truncating, and scrubs the
  `reason` field; a regression test asserts a truncated PEM block cannot leave
  key material in the log.

### Documentation
- Corrected the Bun requirement to **≥ 1.2** (CI pins **1.4.4**, because
  `bun.lock` is the text lockfile) in `README.md`, `CLAUDE.md` and
  `CONTRIBUTING.md`.
- Updated the test counts (81) and qualified several over-broad security claims.
- Added contributor guidance for security regression tests and this document.

### Verification
`bun run typecheck` — clean. `bun test` — **81 pass / 0 fail / 297 assertions
across 13 files**. `bun run build:graph` and CLI smoke checks still pass. Remote
CI (`verify`) is re-run on this push. `bun run eval` remains unverified because
it requires a configured provider.

---

## 4. Residual risk (deliberately not claimed as fixed)

1. **Egress policy (F-03, partial).** The allowlist itself is still opt-in
   (`COWORK_SANDBOX_ENABLED` defaults to `false`) for compatibility: with it off,
   any *public* host is reachable, though private/special-use destinations are
   blocked regardless. Operators who need a strict egress policy must set
   `COWORK_SANDBOX_ENABLED=true` and `COWORK_SANDBOX_ALLOWLIST`. DNS rebinding is
   mitigated by a pre-request recheck but not eliminated (there is no IP pinning
   on the socket).
2. **Authentication hardening (F-06, P1).** No failed-auth backoff/lockout,
   webhook signatures have no timestamp/nonce replay protection, the browser
   stores the token in `localStorage`, HTML responses have no CSP/security
   headers, and ephemeral tokens are printed to stderr.
3. **Supply chain and child processes (F-07, F-08, P1).** MCP executables are
   not allowlisted, child environments use a denylist rather than an allowlist,
   container mode inherits the parent environment, MCP requests have no timeout,
   marketplace downloads are unsigned, and `--yes` still auto-approves shell
   execution. Container isolation remains opt-in.
4. **Prompt-injectable project context (F-09, P1).** File tools can read secret
   files inside the project root, and project `CLAUDE.md`/`MEMORY.md` are loaded
   into the system prompt by default.
5. **Desktop and dev server (F-14, F-15, P1).** Electron IPC open operations lack
   scheme/path allowlists and the Vite dev server binds `0.0.0.0`.
6. **Correctness / defence in depth (F-10…F-13, F-17…F-20, P2).** Includes
   unbounded session/stream growth, check-then-use path resolution, project
   settings able to influence provider/limits, dependency hygiene, error detail
   leakage, TOTP replay, latent dangerous extended tools, and one remaining
   permission declaration (`GraphifyBuildTool` writes while declared
   `READ_ONLY`) plus the general "writes at elevated levels" wording.

---

## 5. Recommendations (next steps)

- **Before any non-loopback or multi-user exposure:** implement F-06 (auth
  throttling, HMAC timestamp+nonce, CSP/security headers, safer token storage),
  F-07/F-08 (MCP allowlist + filtered env + timeouts, container isolation by
  default, non-`--yes`-able shell confirmation), F-09 (sensitive-file denylist
  and untrusted-context framing), F-14/F-15.
- **Defence in depth:** F-11/-12/-13 limits and containment; F-17 dependency
  audit and pinned actions; F-18 generic client errors with server-side detail;
  F-19 TOTP step tracking; F-20 remove or gate the latent extended tools.
- **Guard against regressions:** add a CI check asserting that the registered
  tool list and each tool's declared `PermissionLevel` / `requiresApproval`
  match an explicit reviewed manifest, so an unwired tool cannot be exposed by a
  single import.
- **Keep security tests as the specification:** every new fix should add a test
  that fails on the old behaviour, following the pattern in
  `packages/core/test/redteam-regressions.test.ts`,
  `packages/security/test/hardening.test.ts` and
  `packages/openclaw/test/gateway.test.ts`.

---

## 6. What the build already does well (preserve these)

Loopback binds with mandatory tokens and constant-time comparison; HMAC over the
exact raw webhook body; `redirect: "manual"` in `HttpFetch`; a fail-closed
`PermissionGate` with derived nested policies; symlink-aware `guardPath`; a
strict key whitelist for dashboard settings patches and untrusted project
settings; strict CLI flag parsing with fail-closed non-TTY approvals; an honest
feature matrix; and generated state excluded from version control.
