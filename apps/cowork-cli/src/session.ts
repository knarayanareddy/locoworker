// apps/cowork-cli/src/session.ts
// PHASE 6: wires Telemetry, Analytics, Audit, Wiki, and Kairos.

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
  resolveSettings,
  PermissionLevel,
  queryLoop,
} from "@cowork/core";
import type { ToolDefinition } from "@cowork/core";
import { HookRegistry, type HookContext } from "@cowork/core/hooks";
import { SessionManager } from "@cowork/core/session";
import { SkillRegistry } from "@cowork/core/skills";
import { buildMcpTools } from "@cowork/core/mcp";
import type { McpServerConfig } from "@cowork/core/mcp";
import type { Settings, ResolvedSettings } from "@cowork/core";

// Phase 6 imports
import { CostTracker } from "@cowork/telemetry/cost";
import { Tracer } from "@cowork/telemetry/trace";
import { SessionAnalyticsCollector } from "@cowork/analytics";
import { AuditLog } from "@cowork/security/audit";
import { WikiStore, WikiCompiler, makeWikiTools } from "@cowork/wiki";
import { KairosDaemon } from "@cowork/kairos/daemon";

// Import Graphify tools from core (they now safely lazy-init)
import { makeGraphifyBuildTool, makeGraphifyQueryTool, GraphifySession } from "@cowork/core/tools/graphify";

// Phase 7 imports
import { Coordinator } from "@cowork/orchestrator/coordinator";
import { CouncilDebate } from "@cowork/orchestrator/council";
import { ResearchPlanner } from "@cowork/research/planner";
import { ResearchExecutor } from "@cowork/research/executor";
import { ResearchReporter } from "@cowork/research/reporter";
import { makeResearchTools } from "@cowork/research/tools";
import { SimulationRunner } from "@cowork/mirofish/simulation";
import { makeSimulationTools } from "@cowork/mirofish/tools";
import { GatewayServer } from "@cowork/openclaw/gateway";
import { TelegramBot } from "@cowork/openclaw/telegram";
import { HermesServer } from "@cowork/hermes/server";

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
  // Phase 6 additions
  costTracker: CostTracker;
  tracer: Tracer;
  analyticsCollector: SessionAnalyticsCollector;
  auditLog: AuditLog;
  wikiStore: WikiStore;
  kairos: KairosDaemon;
  // Phase 7 additions
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

function generateSessionId(): string {
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export async function buildSessionRuntime(
  settings: ResolvedSettings
): Promise<SessionRuntime> {
  const cwd = resolve(settings.workingDirectory ?? process.cwd());

  // ── Core subsystems ────────────────────────────────────────────────────────
  const provider = resolveProvider({
    provider: settings.provider,
    model: settings.model,
    apiKey: settings.apiKey,
    baseUrl: settings.baseUrl,
    env: process.env as any,
  });

  const engine = new QueryEngine(provider);

  const memory = new MemorySystem({
    projectRoot: cwd,
    embedderUrl: settings.embedderUrl,
    embedderModel: settings.embedderModel,
    embedderApiKey: settings.embedderApiKey,
  });
  await memory.store.init();

  const compressor = new ContextCompressor(engine, {
    contextWindow: settings.contextWindow,
  });

  const sessionId = generateSessionId();

  // ── Phase 6: Telemetry ──────────────────────────────────────────────────────
  const costTracker = new CostTracker();
  await costTracker.init();

  const tracer = new Tracer({
    enabled: process.env["COWORK_TELEMETRY_ENABLED"] === "true",
    otlpEndpoint: process.env["COWORK_OTLP_ENDPOINT"],
    consoleExport: process.env["COWORK_TELEMETRY_CONSOLE"] === "true",
    serviceName: "locoworker",
  });

  // ── Phase 6: Analytics ──────────────────────────────────────────────────────
  const analyticsCollector = new SessionAnalyticsCollector({
    sessionId,
    projectRoot: cwd,
    provider: settings.provider,
    model: settings.model ?? "unknown",
  });
  await analyticsCollector.init();

  // ── Phase 6: Audit ──────────────────────────────────────────────────────────
  const auditLog = new AuditLog({ sessionId, projectRoot: cwd });
  await auditLog.init();
  await auditLog.sessionStart();

  // ── Phase 6: Wiki ───────────────────────────────────────────────────────────
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

  // ── Phase 6: Kairos Daemon ──────────────────────────────────────────────────
  const kairos = new KairosDaemon({
    projectRoot: cwd,
    enableFileWatch: process.env["COWORK_KAIROS_FILE_WATCH"] === "true",
    onTaskPrompt: async (prompt, task) => {
      console.log(`\n[kairos] Task "${task.name}" fired. Running agent prompt...`);
      // Phase 7: this will spawn a full queryLoop session via SessionManager
      // For Phase 6: log and skip (daemon is in-process but prompt execution is deferred)
      console.log(`[kairos] Prompt: ${prompt.slice(0, 100)}`);
    },
  });

  if (process.env["COWORK_KAIROS_ENABLED"] === "true") {
    await kairos.start();
  }

  // ── Session manager ────────────────────────────────────────────────────────
  const sessionManager = new SessionManager(cwd);
  await sessionManager.init();
  await sessionManager.create({
    id: sessionId,
    name: `Session ${new Date().toLocaleTimeString()}`,
    projectRoot: cwd,
    provider: settings.provider ?? "ollama",
    model: settings.model ?? "default",
    permissionMode: settings.permissionMode,
  });

  // ── Skills ─────────────────────────────────────────────────────────────────
  const skills = new SkillRegistry(cwd);
  await skills.load();

  // ── Hooks ──────────────────────────────────────────────────────────────────
  const hooks = new HookRegistry();

  // Audit and Trace hooks
  hooks.register("pre-tool", async (name: string, input: any) => {
    await auditLog.log("tool_call", {
      toolName: name,
      inputSummary: JSON.stringify(input),
      outcome: "success",
    });
  });

  hooks.register("post-tool", async (name: string, input: any, result: any) => {
    if (name === "bash") {
      await auditLog.bashCommand(
        (input as any).command,
        result.isError ? "error" : "success",
        0
      );
    }
  });

  hooks.register("on-complete", async (ctx: HookContext) => {
    // Update session record (Phase 5)
    await sessionManager.update(sessionId, {
      status: "complete",
      summary: ctx.finalText.slice(0, 500),
      totalInputTokens: ctx.totalInputTokens,
      totalOutputTokens: ctx.totalOutputTokens,
      turns: ctx.turnIndex + 1,
    });

    // Cost tracking (Phase 6)
    const costRecord = await costTracker.trackSession({
      sessionId,
      model: settings.model ?? "unknown",
      provider: settings.provider,
      projectRoot: cwd,
      inputTokens: ctx.totalInputTokens,
      outputTokens: ctx.totalOutputTokens,
    });

    // Analytics (Phase 6)
    analyticsCollector.complete(costRecord.costUsd);
    await analyticsCollector.persist();

    // Audit (Phase 6)
    await auditLog.sessionEnd(ctx.turnIndex + 1, ctx.totalInputTokens + ctx.totalOutputTokens);

    // Flush traces (Phase 6)
    await tracer.flush();

    // Stop kairos daemon on session end (Phase 6)
    if (kairos.isRunning()) await kairos.stop();

    // Phase 7 cleanup
    if (telegramBot) telegramBot.stopPolling();
    if (gatewayServer) gatewayServer.stop();
  });

  // ── MCP tools ──────────────────────────────────────────────────────────────
  const mcpConfigs: McpServerConfig[] = settings.mcpServers ?? [];
  const { tools: mcpTools, clients: mcpClients } = mcpConfigs.length > 0
    ? await buildMcpTools(mcpConfigs)
    : { tools: [], clients: [] };

  // ── Graphify tools ─────────────────────────────────────────────────────────
  let graphifyTools: ToolDefinition[] = [];
  if (settings.enableGraphify) {
    const graphifySession = new GraphifySession(cwd);
    graphifyTools = [
      makeGraphifyBuildTool(graphifySession),
      makeGraphifyQueryTool(graphifySession),
    ];
  }

  // --- Phase 7: Orchestrator + Council ---
  const coordinator = new Coordinator({
    engine,
    tools: DEFAULT_TOOLS,
    systemPrompt: SYSTEM_PROMPT,
    workerCount: parseInt(process.env["COWORK_WORKER_COUNT"] ?? "3", 10),
    enablePlanning: process.env["COWORK_COORDINATOR_PLANNING"] === "true",
  });

  const council = new CouncilDebate(engine, DEFAULT_TOOLS);

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
        parallel: {
          type: "boolean",
          description: "Run subtasks in parallel (default true).",
        },
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
      const result = await council.debate(input.question, {
        rounds: Math.min(input.rounds ?? 2, 4),
      });
      return { content: result.verdict, isError: false };
    },
  };

  // --- Phase 7: Research ---
  const researchPlanner = new ResearchPlanner(engine);
  const researchExecutor = new ResearchExecutor(engine, DEFAULT_TOOLS);
  const researchReporter = new ResearchReporter(engine, wikiStore);
  const researchTools = makeResearchTools(researchPlanner, researchExecutor, researchReporter);

  // --- Phase 7: MiroFish ---
  const simulationRunner = new SimulationRunner(engine, DEFAULT_TOOLS, wikiStore);
  const simulationTools = makeSimulationTools(simulationRunner);

  // --- Phase 7: OpenClaw (optional, based on env) ---
  let gatewayServer: GatewayServer | null = null;
  let telegramBot: TelegramBot | null = null;

  if (process.env["COWORK_OPENCLAW_ENABLED"] === "true") {
    const gatewayPort = parseInt(process.env["COWORK_GATEWAY_PORT"] ?? "4242", 10);
    const rateLimit = parseInt(process.env["COWORK_GATEWAY_RATE_LIMIT"] ?? "20", 10);

    gatewayServer = new GatewayServer({
      port: gatewayPort,
      rateLimitPerMinute: rateLimit,
      authToken: process.env["COWORK_GATEWAY_AUTH_TOKEN"],
    });

    const gatewayHandler = async (msg: import("@cowork/openclaw/gateway").InboundMessage) => {
      let response = "";
      for await (const event of queryLoop(msg.text, {
        engine,
        systemPrompt: SYSTEM_PROMPT,
        tools: DEFAULT_TOOLS,
        maxTurns: 10,
        requestApproval: async () => false, // Gateway auto-denies dangerous ops
      })) {
        if (event.type === "text") response += event.text;
      }
      return response || "No response generated.";
    };

    gatewayServer.onMessage(gatewayHandler);
    gatewayServer.start();

    if (process.env["TELEGRAM_BOT_TOKEN"]) {
      telegramBot = new TelegramBot({
        token: process.env["TELEGRAM_BOT_TOKEN"],
        rateLimitPerMinute: rateLimit,
        allowedChatIds: (process.env["TELEGRAM_ALLOWED_CHATS"] ?? "")
          .split(",")
          .filter(Boolean)
          .map(Number),
      });
      telegramBot.onMessage(gatewayHandler);
      telegramBot.startPolling();
    }
  }

  // --- Phase 7: Hermes MCP server (optional) ---
  let hermesServer: HermesServer | null = null;

  if (process.env["COWORK_HERMES_ENABLED"] === "true") {
    const transport = (process.env["COWORK_HERMES_TRANSPORT"] ?? "sse") as "stdio" | "sse";
    const hermesPort = parseInt(process.env["COWORK_HERMES_PORT"] ?? "3100", 10);

    hermesServer = new HermesServer(
      {
        transport,
        port: transport === "sse" ? hermesPort : undefined,
        authToken: process.env["COWORK_HERMES_AUTH_TOKEN"],
        toolAllowlist: (process.env["COWORK_HERMES_TOOL_ALLOWLIST"] ?? "")
          .split(",")
          .filter(Boolean),
        serverName: "locoworker-hermes",
      },
      [...DEFAULT_TOOLS]
    );

    if (transport === "sse") {
      hermesServer.startSse();
    }
  }

  // --- Final tool list (Phase 7) ---
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

  // ── System prompt ──────────────────────────────────────────────────────────
  const buildSystemPrompt = async (): Promise<string> => {
    if (settings.loadProjectContext) {
      return assembleSystemPrompt(SYSTEM_PROMPT, cwd, memory);
    }
    return SYSTEM_PROMPT;
  };

  const systemPrompt = await buildSystemPrompt();

  return {
    engine,
    memory,
    compressor,
    tools,
    systemPrompt,
    sessionId,
    sessionManager,
    skills,
    hooks,
    mcpClients,
    refreshSystemPrompt: buildSystemPrompt,
    // Phase 6 additions
    costTracker,
    tracer,
    analyticsCollector,
    auditLog,
    wikiStore,
    kairos,
    // Phase 7 additions
    coordinator,
    council,
    researchPlanner,
    researchExecutor,
    researchReporter,
    simulationRunner,
    gatewayServer,
    telegramBot,
    hermesServer,
  };
}
