// apps/cowork-cli/src/session.ts
// Builds the shared runtime. Every nested agent, MCP server and gateway
// inherits the caller's AgentPolicy instead of silently resetting it.

import { resolve } from "node:path";
import {
  resolveProvider,
  QueryEngine,
  MemorySystem,
  ContextCompressor,
  DEFAULT_TOOLS,
  makeMemoryTools,
  SYSTEM_PROMPT,
  assembleSystemPrompt,
  PermissionLevel,
  queryLoop,
  setDefaultAgentPolicy,
  deriveNestedPolicy,
} from "@cowork/core";
import type {
  ToolDefinition,
  ResolvedSettings,
  AgentPolicy,
  ApprovalFn,
  Message,
} from "@cowork/core";
import { HookRegistry, type HookContext } from "@cowork/core/hooks";
import { SessionManager } from "@cowork/core/session";
import { SkillRegistry } from "@cowork/core/skills";
import { buildMcpTools } from "@cowork/core/mcp";
import type { McpServerConfig } from "@cowork/core/mcp";

import { CostTracker } from "@cowork/telemetry/cost";
import { Tracer } from "@cowork/telemetry/trace";
import { SessionAnalyticsCollector } from "@cowork/analytics";
import { AuditLog } from "@cowork/security/audit";
import { WikiStore, WikiCompiler, makeWikiTools } from "@cowork/wiki";
import { KairosDaemon } from "@cowork/kairos/daemon";

import { makeGraphifyBuildTool, makeGraphifyQueryTool, GraphifySession } from "@cowork/core/tools/graphify";

import { Coordinator } from "@cowork/orchestrator/coordinator";
import { CouncilDebate } from "@cowork/orchestrator/council";
import { ResearchPlanner } from "@cowork/research/planner";
import { ResearchExecutor } from "@cowork/research/executor";
import { ResearchReporter } from "@cowork/research/reporter";
import { makeResearchTools } from "@cowork/research/tools";
import { SimulationRunner } from "@cowork/mirofish/simulation";
import { makeSimulationTools } from "@cowork/mirofish/tools";
import { GatewayServer } from "@cowork/openclaw/gateway";
import type { InboundMessage } from "@cowork/openclaw/gateway";
import { TelegramBot } from "@cowork/openclaw/telegram";
import { HermesServer } from "@cowork/hermes/server";
import { makeApproval } from "./approval.js";

export interface SessionRuntime {
  engine: QueryEngine;
  memory: MemorySystem;
  compressor: ContextCompressor;
  tools: ToolDefinition[];
  systemPrompt: string;
  sessionId: string;
  sessionManager: SessionManager;
  skills: SkillRegistry;
  hooks: HookRegistry;
  mcpClients: Awaited<ReturnType<typeof buildMcpTools>>["clients"];
  refreshSystemPrompt: () => Promise<string>;
  /** Full interactive policy for the main agent loop. */
  policy: AgentPolicy;
  /** Fail-closed policy inherited by all nested agents and remote surfaces. */
  nestedPolicy: AgentPolicy;
  requestApproval: ApprovalFn;
  /** Chat history loaded by --resume (may be empty). */
  resumeHistory: Message[];
  /** Explicit teardown; hooks no longer stop services after the first turn. */
  shutdown: () => Promise<void>;
  costTracker: CostTracker;
  tracer: Tracer;
  analyticsCollector: SessionAnalyticsCollector;
  auditLog: AuditLog;
  wikiStore: WikiStore;
  kairos: KairosDaemon;
  coordinator: Coordinator;
  council: CouncilDebate;
  researchPlanner: ResearchPlanner;
  researchExecutor: ResearchExecutor;
  researchReporter: ResearchReporter;
  simulationRunner: SimulationRunner;
  gatewayServer: GatewayServer | null;
  telegramBot: TelegramBot | null;
  hermesServer: HermesServer | null;
}

export interface SessionOptions {
  /** Existing session id to resume (loads its transcript). */
  resume?: string;
  /** Auto-approve tool calls (--yes). */
  yes?: boolean;
  abortSignal?: AbortSignal;
}

function generateSessionId(): string {
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export async function buildSessionRuntime(
  settings: ResolvedSettings,
  options: SessionOptions = {},
): Promise<SessionRuntime> {
  const cwd = resolve(settings.workingDirectory ?? process.cwd());

  const provider = resolveProvider({
    provider: settings.provider,
    model: settings.model,
    apiKey: settings.apiKey,
    baseUrl: settings.baseUrl,
    env: process.env,
  });
  const engine = new QueryEngine(provider);

  const memory = new MemorySystem({
    projectRoot: cwd,
    embedderUrl: settings.embedderUrl,
    embedderModel: settings.embedderModel,
    embedderApiKey: settings.embedderApiKey,
  });
  await memory.store.init();

  const compressor = new ContextCompressor(engine, { contextWindow: settings.contextWindow });

  const sessionManager = new SessionManager(cwd);
  await sessionManager.init();

  const sessionId = options.resume ?? generateSessionId();
  let resumeHistory: Message[] = [];
  if (options.resume) {
    const record = await sessionManager.get(sessionId);
    if (!record) throw new Error(`Cannot resume: session "${sessionId}" was not found`);
    resumeHistory = await memory.readTranscript(sessionId, 40);
    process.stdout.write(`[session] Resuming ${sessionId} (${resumeHistory.length} messages)\n`);
  } else {
    await sessionManager.create({
      id: sessionId,
      name: `Session ${new Date().toLocaleTimeString()}`,
      projectRoot: cwd,
      provider: settings.provider,
      model: settings.model ?? "default",
      permissionMode: settings.permissionMode,
    });
  }

  const interactive = process.stdin.isTTY === true;
  if (!options.yes && !interactive) {
    process.stderr.write(
      "[session] Non-interactive stdin: tool calls that need approval will be denied (use --yes to opt in).\n",
    );
  }
  const requestApproval: ApprovalFn = options.yes
    ? async () => true
    : interactive
      ? makeApproval({ autoApprove: false })
      : async () => false;

  // ── Telemetry / audit ─────────────────────────────────────────────────────
  const costTracker = new CostTracker();
  await costTracker.init();
  const tracer = new Tracer({
    enabled: process.env.COWORK_TELEMETRY_ENABLED === "true",
    otlpEndpoint: process.env.COWORK_OTLP_ENDPOINT,
    consoleExport: process.env.COWORK_TELEMETRY_CONSOLE === "true",
    serviceName: "locoworker",
  });
  const analyticsCollector = new SessionAnalyticsCollector({
    sessionId,
    projectRoot: cwd,
    provider: settings.provider,
    model: settings.model ?? "unknown",
  });
  await analyticsCollector.init();
  const auditLog = new AuditLog({ sessionId, projectRoot: cwd });
  await auditLog.init();
  await auditLog.sessionStart();

  // ── Hooks ────────────────────────────────────────────────────────────────
  const hooks = new HookRegistry();
  hooks.register("post-tool", async (name: string, input: unknown, result: { content: string; isError: boolean }) => {
    await auditLog.toolCall(name, JSON.stringify(input), 0, result.isError);
    if (name === "Bash") {
      await auditLog.bashCommand(
        String((input as { command?: string }).command ?? ""),
        result.isError ? "error" : "success",
        0,
      );
    }
  });
  hooks.register("on-complete", async (ctx: HookContext) => {
    // Per-turn bookkeeping only. Session teardown happens in shutdown().
    await sessionManager.update(sessionId, {
      summary: ctx.finalText.slice(0, 500),
      totalInputTokens: ctx.totalInputTokens,
      totalOutputTokens: ctx.totalOutputTokens,
      turns: ctx.turnIndex + 1,
    });
  });

  // ── Policy (shared by the main loop and every nested agent) ───────────────
  const policy: AgentPolicy = {
    permissionLevel: settings.permissionLevel,
    requestApproval,
    settings,
    workingDirectory: cwd,
    sessionId,
    abortSignal: options.abortSignal,
    hooks,
    maxTurns: settings.maxTurns,
    maxTokens: settings.maxTokens,
  };
  const nestedPolicy: AgentPolicy = deriveNestedPolicy(policy, {
    // Background agents cannot pop up an approval prompt: deny instead.
    requestApproval: async () => false,
  });
  // Any nested loop that forgets to pass a policy inherits this fail-closed one.
  setDefaultAgentPolicy(nestedPolicy);

  // ── Wiki ─────────────────────────────────────────────────────────────────
  const wikiStore = new WikiStore(cwd);
  await wikiStore.init();
  const wikiCompiler = new WikiCompiler(wikiStore, async (prompt) => {
    const response = await engine.call({
      systemPrompt: "You are a precise knowledge compiler.",
      messages: [{ role: "user", content: prompt }],
      tools: [],
      maxTokens: 2000,
    });
    return response.content
      .filter((b) => b.type === "text")
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
  });
  const wikiTools = settings.enableWiki !== false ? makeWikiTools(wikiStore, wikiCompiler) : [];

  // ── Kairos daemon ────────────────────────────────────────────────────────
  const kairos = new KairosDaemon({
    projectRoot: cwd,
    enableFileWatch: process.env.COWORK_KAIROS_FILE_WATCH === "true",
    onTaskPrompt: async (prompt, task) => {
      let answer = "";
      for await (const event of queryLoop(prompt, {
        engine,
        systemPrompt: SYSTEM_PROMPT,
        tools: [],
        maxTurns: 3,
        policy: nestedPolicy,
      })) {
        if (event.type === "complete") answer = event.text;
      }
      process.stdout.write(`\n[kairos] ${task.name}: ${answer.slice(0, 200)}\n`);
    },
  });
  if (process.env.COWORK_KAIROS_ENABLED === "true") await kairos.start();

  const skills = new SkillRegistry(cwd);
  await skills.load();

  // ── MCP / Graphify tools ─────────────────────────────────────────────────
  const mcpConfigs: McpServerConfig[] = settings.mcpServers ?? [];
  const { tools: mcpTools, clients: mcpClients } = mcpConfigs.length > 0
    ? await buildMcpTools(mcpConfigs)
    : { tools: [], clients: [] };

  let graphifyTools: ToolDefinition[] = [];
  if (settings.enableGraphify) {
    const graphifySession = new GraphifySession(cwd);
    graphifyTools = [makeGraphifyBuildTool(graphifySession), makeGraphifyQueryTool(graphifySession)];
  }

  // ── Nested agent components (all inherit the caller's policy) ─────────────
  const coordinator = new Coordinator({
    engine,
    tools: DEFAULT_TOOLS,
    systemPrompt: SYSTEM_PROMPT,
    workerCount: parseInt(process.env.COWORK_WORKER_COUNT ?? "3", 10),
    enablePlanning: process.env.COWORK_COORDINATOR_PLANNING === "true",
    policy: nestedPolicy,
  });
  const council = new CouncilDebate(engine, DEFAULT_TOOLS, undefined, nestedPolicy);
  const researchPlanner = new ResearchPlanner(engine, nestedPolicy);
  const researchExecutor = new ResearchExecutor(engine, DEFAULT_TOOLS, nestedPolicy);
  const researchReporter = new ResearchReporter(engine, wikiStore, nestedPolicy);
  const researchTools = makeResearchTools(researchPlanner, researchExecutor, researchReporter);
  const simulationRunner = new SimulationRunner(engine, DEFAULT_TOOLS, wikiStore, nestedPolicy);
  const simulationTools = makeSimulationTools(simulationRunner);

  const coordinatorTool: ToolDefinition = {
    name: "orchestrate",
    description:
      "Delegate a complex task to the multi-agent coordinator. " +
      "The coordinator decomposes it into subtasks, runs worker agents in parallel, " +
      "and synthesizes the results.",
    permissionLevel: PermissionLevel.STANDARD,
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "The complex task to orchestrate." },
        parallel: { type: "boolean", description: "Run subtasks in parallel (default true)." },
      },
      required: ["prompt"],
    },
    async execute(input: { prompt: string; parallel?: boolean }) {
      const result = await coordinator.run(input.prompt);
      return { content: result.synthesis, isError: false };
    },
  };

  const councilTool: ToolDefinition = {
    name: "council_debate",
    description:
      "Run a multi-agent council debate. Three AI council members (Architect, Pragmatist, Skeptic) " +
      "debate your question and produce a consensus verdict.",
    permissionLevel: PermissionLevel.STANDARD,
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string", description: "The question or decision to debate." },
        rounds: { type: "number", description: "Number of debate rounds (default 2, max 4)." },
      },
      required: ["question"],
    },
    async execute(input: { question: string; rounds?: number }) {
      const result = await council.debate(input.question, { rounds: Math.min(input.rounds ?? 2, 4) });
      return { content: result.verdict, isError: false };
    },
  };

  // ── Remote surfaces ──────────────────────────────────────────────────────
  let gatewayServer: GatewayServer | null = null;
  let telegramBot: TelegramBot | null = null;
  let hermesServer: HermesServer | null = null;

  // Remote callers get read-only tools, no approvals, and the caller's policy.
  const remotePolicy: AgentPolicy = deriveNestedPolicy(nestedPolicy, {
    permissionLevel: PermissionLevel.READ_ONLY,
    requestApproval: async () => false,
  });

  if (process.env.COWORK_OPENCLAW_ENABLED === "true") {
    const gatewayPort = parseInt(process.env.COWORK_GATEWAY_PORT ?? "4242", 10);
    const rateLimit = parseInt(process.env.COWORK_GATEWAY_RATE_LIMIT ?? "20", 10);
    const allowedSenders = (process.env.COWORK_GATEWAY_ALLOWED_SENDERS ?? "")
      .split(",").map((s) => s.trim()).filter(Boolean);

    gatewayServer = new GatewayServer({
      port: gatewayPort,
      rateLimitPerMinute: rateLimit,
      authToken: process.env.COWORK_GATEWAY_AUTH_TOKEN,
      webhookSecret: process.env.COWORK_GATEWAY_WEBHOOK_SECRET,
      allowedSenders: allowedSenders.length > 0 ? allowedSenders : undefined,
      hostname: process.env.COWORK_GATEWAY_HOST,
    });

    const gatewayHandler = async (msg: InboundMessage): Promise<string> => {
      let response = "";
      for await (const event of queryLoop(msg.text, {
        engine,
        systemPrompt: SYSTEM_PROMPT,
        tools: [],
        maxTurns: 10,
        policy: remotePolicy,
      })) {
        if (event.type === "complete") response = event.text;
      }
      return response || "No response generated.";
    };

    gatewayServer.onMessage(gatewayHandler);
    gatewayServer.start();

    const telegramToken = process.env.COWORK_TELEGRAM_BOT_TOKEN ?? process.env.TELEGRAM_BOT_TOKEN;
    if (telegramToken) {
      telegramBot = new TelegramBot({
        token: telegramToken,
        rateLimitPerMinute: rateLimit,
        allowedChatIds: (process.env.TELEGRAM_ALLOWED_CHATS ?? "")
          .split(",").filter(Boolean).map(Number),
      });
      telegramBot.onMessage(gatewayHandler);
      telegramBot.startPolling();
    }
  }

  if (process.env.COWORK_HERMES_ENABLED === "true") {
    const transport = (process.env.COWORK_HERMES_TRANSPORT ?? "sse") as "stdio" | "sse";
    const hermesPort = parseInt(process.env.COWORK_HERMES_PORT ?? "3100", 10);
    hermesServer = new HermesServer(
      {
        transport,
        port: transport === "sse" ? hermesPort : undefined,
        authToken: process.env.COWORK_HERMES_AUTH_TOKEN,
        hostname: process.env.COWORK_HERMES_HOST,
        toolAllowlist: (process.env.COWORK_HERMES_TOOL_ALLOWLIST ?? "")
          .split(",").map((s) => s.trim()).filter(Boolean),
        serverName: "locoworker-hermes",
        policy: remotePolicy,
        permissionLevel: remotePolicy.permissionLevel,
        settings,
        workingDirectory: cwd,
        requestApproval: async () => false,
      },
      [...DEFAULT_TOOLS],
    );
    if (transport === "sse") hermesServer.startSse();
    else {
      process.stderr.write(
        "[hermes] stdio transport shares stdin with the REPL; not started here. " +
        "Use `bun run hermes:stdio` instead.\n",
      );
    }
  }

  const tools: ToolDefinition[] = [
    ...DEFAULT_TOOLS,
    ...makeMemoryTools(memory, sessionId),
    ...graphifyTools,
    ...mcpTools,
    ...wikiTools,
    ...researchTools,
    ...simulationTools,
    coordinatorTool,
    councilTool,
  ];

  const buildSystemPrompt = async (): Promise<string> =>
    settings.loadProjectContext ? assembleSystemPrompt(SYSTEM_PROMPT, cwd, memory) : SYSTEM_PROMPT;
  const systemPrompt = await buildSystemPrompt();

  let shutdownDone = false;
  const shutdown = async (): Promise<void> => {
    if (shutdownDone) return;
    shutdownDone = true;
    telegramBot?.stopPolling();
    gatewayServer?.stop();
    if (kairos.isRunning()) await kairos.stop();
    await tracer.flush();
    await auditLog.sessionEnd(0, 0);
    await sessionManager.update(sessionId, { status: "complete" });
    for (const client of mcpClients) await client.disconnect().catch(() => {});
    setDefaultAgentPolicy(undefined);
  };

  return {
    engine, memory, compressor, tools, systemPrompt, sessionId, sessionManager,
    skills, hooks, mcpClients, refreshSystemPrompt: buildSystemPrompt,
    policy, nestedPolicy, requestApproval, resumeHistory, shutdown,
    costTracker, tracer, analyticsCollector, auditLog, wikiStore, kairos,
    coordinator, council, researchPlanner, researchExecutor, researchReporter,
    simulationRunner, gatewayServer, telegramBot, hermesServer,
  };
}
