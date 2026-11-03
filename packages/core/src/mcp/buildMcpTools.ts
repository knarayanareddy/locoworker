// packages/core/src/mcp/buildMcpTools.ts

/**
 * R-13: MCP servers are *untrusted config-driven code execution*.
 *
 * Before this pass, any `mcpServers` entry (including one loaded from
 * `--mcp-config`, which may live in a cloned repository) was spawned with the
 * full parent environment, its tool descriptions were injected verbatim into
 * the model prompt, and its tools were registered with `requiresApproval: false`.
 *
 * Now: explicit operator consent per server, an executable allowlist, a
 * filtered child env, bounded/untrusted-framed descriptions, validated input
 * schemas, tool-count caps, collision detection, and approval gating.
 */
import { resolve } from "node:path";
import {
  mergeResourceLimits,
  mergeSupplyChainPolicy,
  type ResourceLimits,
  type SupplyChainPolicy,
} from "@cowork/security/utils";
import type { ToolDefinition } from "../Tool.js";
import type { McpClient, McpServerConfig } from "./types.js";
import { McpStdioClient } from "./McpStdioClient.js";
import {
  makeMcpToolDefinition,
  DEFAULT_MCP_METADATA_LIMITS,
} from "./mcpToolMetadata.js";

export interface McpBuildOptions {
  /** Trusted override for the operator's per-server consent list. */
  allowedServerNames?: readonly string[];
  /** Trusted override for the operator's executable allowlist. */
  allowedCommands?: readonly string[];
  /** Trusted absolute project root used as the child's cwd. */
  projectRoot?: string;
  /** Interactive consent hook; returning true allows one server to start. */
  approveServer?: (config: McpServerConfig) => boolean | Promise<boolean>;
  /** Trusted resource-limit overrides. */
  limits?: Partial<ResourceLimits>;
  /** Environment used to resolve the default policy (tests may inject). */
  env?: NodeJS.ProcessEnv;
  /** Pre-resolved supply-chain policy (tests / explicit CLI callers). */
  policy?: SupplyChainPolicy;
}

const SAFE_SERVER_NAME = /^[A-Za-z0-9_.-]{1,64}$/;

function warn(message: string): void {
  process.stderr.write(`[mcp] ${message}\n`);
}

export async function buildMcpTools(
  configs: McpServerConfig[],
  options: McpBuildOptions = {},
): Promise<{ tools: ToolDefinition[]; clients: McpClient[] }> {
  const clients: McpClient[] = [];
  const tools: ToolDefinition[] = [];
  const seen = new Set<string>();
  const limits = mergeResourceLimits(options.limits, options.env ?? process.env);
  const policy = options.policy ?? mergeSupplyChainPolicy(undefined, options.env ?? process.env);
  const allowedCommands = options.allowedCommands ?? policy.mcpAllowedCommands;
  const allowedServerNames = options.allowedServerNames ?? policy.mcpAllowedServerNames;
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const metadataLimits = {
    ...DEFAULT_MCP_METADATA_LIMITS,
    maxDescriptionChars: limits.mcpMaxDescriptionChars,
  };

  for (const config of configs) {
    if (!SAFE_SERVER_NAME.test(config.name)) {
      warn(`invalid server name "${config.name}" — skipping`);
      continue;
    }

    // Consent: an explicit operator allowlist OR an interactive approval.
    const consented = allowedServerNames.includes(config.name)
      || (options.approveServer ? await options.approveServer(config) : false);
    if (!consented) {
      warn(
        `server "${config.name}" is not consented to — skipping ` +
        `(command=${config.command ?? "none"} args=${(config.args ?? []).join(" ")}). ` +
        `Add it to COWORK_MCP_ALLOW_SERVERS to opt in.`,
      );
      continue;
    }

    if (config.transport !== "stdio") {
      // SSE transport: defer to a future McpSseClient implementation.
      warn(`SSE transport not yet implemented for server "${config.name}" — skipping.`);
      continue;
    }
    if (allowedCommands.length === 0) {
      warn(
        `server "${config.name}" skipped: no executables allowlisted. ` +
        `Set COWORK_MCP_ALLOWED_COMMANDS to opt in.`,
      );
      continue;
    }
    if (tools.length >= limits.mcpMaxToolsTotal) {
      warn(`global MCP tool cap (${limits.mcpMaxToolsTotal}) reached — skipping "${config.name}".`);
      continue;
    }

    try {
      const client = new McpStdioClient(config, undefined, {
        allowedCommands,
        cwd: projectRoot,
        parentEnv: options.env ?? process.env,
      });
      await client.connect();
      clients.push(client);

      for (const mcpTool of client.tools.slice(0, limits.mcpMaxToolsPerServer)) {
        if (tools.length >= limits.mcpMaxToolsTotal) break;
        const definition = makeMcpToolDefinition(config, mcpTool, client, metadataLimits);
        if (!definition) {
          warn(`rejected invalid tool metadata from "${config.name}": ${mcpTool.name}`);
          continue;
        }
        if (seen.has(definition.name)) {
          warn(`duplicate MCP tool name "${definition.name}" — skipping`);
          continue;
        }
        seen.add(definition.name);
        tools.push(definition);
      }
    } catch (err) {
      warn(
        `Failed to connect to server "${config.name}": ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      // Don't abort the whole boot — just skip this MCP server.
    }
  }

  return { tools, clients };
}
