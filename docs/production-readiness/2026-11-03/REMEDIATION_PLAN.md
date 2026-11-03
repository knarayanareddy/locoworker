# locoworker — phased remediation plan

All actions and commands below are **planned**, not performed. Start only after the owner approves a disposable synthetic workspace, supported platforms and a threat model; never run adversarial fixtures against personal files or production credentials. Findings refer to the accompanying [review](REVIEW.md). No test threshold should be lowered to pass a gate.

## Phase 0 — baseline and authority map

**LW-T1 — trace and reproduce (LW-1, LW-2, LW-4, LW-5).** Prerequisites: pinned source access, isolated environment, owner-approved synthetic fixtures. Observed paths: `packages/core/src/queryLoop.ts`, `packages/core/src/tools/executeTool.ts`, `apps/dashboard/src/DashboardRouter.ts`, root `package.json`.

1. Trace CLI, streaming, MCP, gateway, desktop and nested-agent call sites to validation, policy, approval and execution; distinguish actually wired routes from merely defined classes.
2. Inventory default and optional sandbox authority, project roots, child-process environment, network access, credentials and persisted state; record the operator identity for each route.
3. With approved tooling, reproduce existing manifest checks and record revision, environment and results; identify what historical CI did not exercise.

**Expected output:** call graph, baseline log and owner-approved trust matrix. **Verification:** a second reviewer follows each claimed route to its actual entry point and marks unresolved paths unknown. **DoD:** [ ] routes and gaps mapped; [ ] baseline recorded without treating historical success as a local pass; [ ] owner accepts trust assumptions. **Exit:** approved boundary tests and known reproduction environment.

## Phase 1 — permissions, approvals and project execution

**LW-T2 — enforce action identity (LW-1, LW-2).** Prerequisite: LW-T1. Observed paths: `packages/core/src/permissions/PermissionGate.ts`, `packages/core/src/tools/executeTool.ts`; proposed path: integration tests under `packages/core/test/`.

1. Design immutable validated tool arguments and bind approval to tool, arguments and execution context; ensure hooks cannot alter the authorized action after validation.
2. Exercise invalid schemas and permission levels, absent/denied approval, altered arguments, hook errors and cancellation through each supported entry point; assert no tool side effect on denial.
3. Test nested policy inheritance and sandbox-unavailable behavior; on supported sandbox platforms attempt outside-workspace reads/writes and synthetic secret exfiltration.

**Expected output:** enforced boundary and end-to-end regression cases. **Verification:** deliberately bypassing validation, mutating approved input or allowing a denied operation must fail the corresponding test; inspect side effects independently. **DoD:** [ ] denied actions produce no side effect; [ ] execution matches approved arguments; [ ] sandbox claims have platform-specific evidence. **Exit:** independent review of policy and isolation evidence.

**LW-T3 — constrain graph execution (LW-5).** Prerequisites: LW-T1, owner decision on trusted project roots. Observed path: `apps/dashboard/src/DashboardRouter.ts:274-289`; proposed path: dashboard integration tests.

1. In a disposable fixture, determine which manifest Bun resolves when `projectRoot` differs from the locoworker installation, and capture the child executable and filtered environment.
2. If project-controlled script execution is possible, replace it with an installation-owned, explicitly scoped graph entry point or require a separately approved trust decision; retain fixed arguments.
3. Test unauthorized requests, allowed and unknown actions, hostile fixture scripts, process failures and completion reporting without real credentials.

**Expected output:** documented resolution and an action that cannot silently run an untrusted project script under the selected policy. **Verification:** a synthetic project script must not run unless the explicitly approved policy permits it; mutation of the allowlist or executable must fail a test. **DoD:** [ ] resolution observed; [ ] trust decision recorded; [ ] negative action test demonstrated. **Exit:** dashboard process boundary reviewed.

## Phase 2 — network, UI and automation

**LW-T4 — dashboard and gateway security (LW-4; preventive security).** Prerequisites: LW-T1 and LW-T3. Observed path: `apps/dashboard/src/DashboardRouter.ts`; proposed paths: route and browser integration tests.

1. Inspect `HttpGuard` and each gateway's actual authentication, bind, origin and authorization logic; inventory sensitive endpoints and role assumptions.
2. Test missing, wrong and rotated tokens, cross-origin requests, non-loopback configuration, oversized input and error responses; inspect synthetic secrets in logs and browser output.
3. Select a token-storage and script policy appropriate to the threat model; test injected untrusted content and verify settings, transcript and audit access/retention against owner policy.

**Expected output:** endpoint matrix and tested mitigations for accepted exposure. **Verification:** unauthenticated access to protected API data must fail; removing a required guard or exposing a synthetic canary must fail a test. **DoD:** [ ] endpoint and authorization matrix reviewed; [ ] token and origin cases observed; [ ] data-handling decisions documented. **Exit:** remaining security exceptions accepted by owner.

**LW-T5 — truthful interfaces and meaningful gates (LW-3; preventive automation/accessibility).** Prerequisites: LW-T1 and LW-T4. Observed paths: `apps/dashboard-frontend/`, `apps/dashboard/src/DashboardRouter.ts`, `.github/workflows/ci.yml`, root `package.json`.

1. Inventory experimental panels and actions against their real data sources; label fixtures, unavailable integrations and stale status without conflating them with the built-in dashboard.
2. Test CLI approval clarity and both dashboards with keyboard, screen reader and error recovery; record supported browsers and unresolved accessibility defects.
3. Add behavior-level tests to the existing CI test/typecheck/scan flow; define any new script before wiring it and preserve frozen-lock and SBOM checks.

**Expected output:** fixture inventory, accessibility report and CI boundary tests. **Verification:** a missing fixture label or removed authorization must fail a targeted test; verify keyboard and screen-reader behavior separately from automated checks. **DoD:** [ ] fixture states visible; [ ] accessibility evidence recorded; [ ] negative controls fail as intended. **Exit:** UI and CI gaps triaged, not inferred from test counts.

## Phase 3 — operations and independent acceptance

**LW-T6 — recovery and release (preventive operational requirement).** Prerequisites: LW-T2–T5 and owner approval for platform, credentials and recovery objectives. Observed paths: `README.md`, `.github/workflows/ci.yml`; proposed path: release and recovery runbook.

1. Inventory session, memory, audit and settings locations; choose retention, encrypted backup, credential rotation, daemon supervision and signing policies.
2. Rehearse backup and restore using synthetic data in a separate environment; verify restored contents, permissions and daemon restart, then document rollback of code and persistent state.
3. Independently identify the exact artifact and source SHA, rerun approved boundary checks, review unresolved risks and obtain owner release authorization.

**Expected output:** recovery evidence and signed-off release record. **Verification:** read restored records and observe the correct running artifact, rather than accepting command exit status; rehearse a rollback without assuming old state is compatible. **DoD:** [ ] restore observed; [ ] rollback and credential rotation rehearsed; [ ] independent reviewer records remaining limits. **Exit:** explicit owner go/no-go, not an automatic production-ready declaration.

## Dependencies, acceptance and change control

Dependency map: T1 → T2 and T3; T3 → T4; T1 + T4 → T5; T2 + T3 + T4 + T5 → T6. Production acceptance: [ ] approved trust model; [ ] all supported entry points enforce action policy; [ ] malicious negative controls fail; [ ] UI states and accessibility verified; [ ] actual deployment and restore observed; [ ] owner accepts residual risk. Real credentials, network exposure, sandbox policy changes, releases and destructive data operations require owner approval. Roll back only to an identified verified artifact and compatible state; stop tool execution if policy or isolation integrity is uncertain. No publication is authorized by this plan.
