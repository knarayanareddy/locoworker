/**
 * Trusted, string-valued supply-chain policy (R-13).
 *
 * All of these are read from the operator's environment — never from a cloned
 * repository's settings.json, an MCP config file, a marketplace index, or a
 * template. Defaults are **deny**: no MCP server starts, no template command
 * runs, and no plugin installs until the operator opts in.
 */
export interface SupplyChainPolicy {
  /** Executables an MCP server or template postInstall may spawn. */
  mcpAllowedCommands: readonly string[];
  /** MCP server names explicitly consented to (or use approveServer()). */
  mcpAllowedServerNames: readonly string[];
  /** Executables a template postInstall step may spawn. */
  templateAllowedCommands: readonly string[];
  /** Global kill-switch: postInstall is off unless this is true. */
  templateAllowPostInstall: boolean;
  /** Trusted Ed25519 public keys (PEM or base64 SPKI/raw) for plugin bundles. */
  pluginTrustedKeys: readonly string[];
}

export const SUPPLY_CHAIN_ENV_NAMES = {
  mcpAllowedCommands: "COWORK_MCP_ALLOWED_COMMANDS",
  mcpAllowedServerNames: "COWORK_MCP_ALLOW_SERVERS",
  templateAllowedCommands: "COWORK_TEMPLATE_ALLOWED_COMMANDS",
  templateAllowPostInstall: "COWORK_TEMPLATE_ALLOW_POSTINSTALL",
  pluginTrustedKeys: "COWORK_PLUGIN_TRUSTED_KEY",
} as const;

function splitList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && value.length <= 4_096);
}

function isTrue(raw: string | undefined): boolean {
  return raw?.trim().toLowerCase() === "true" || raw?.trim() === "1";
}

export function resolveSupplyChainPolicy(
  env: NodeJS.ProcessEnv = process.env,
): SupplyChainPolicy {
  const key = env[SUPPLY_CHAIN_ENV_NAMES.pluginTrustedKeys]?.trim();
  return {
    mcpAllowedCommands: splitList(env[SUPPLY_CHAIN_ENV_NAMES.mcpAllowedCommands]),
    mcpAllowedServerNames: splitList(env[SUPPLY_CHAIN_ENV_NAMES.mcpAllowedServerNames]),
    templateAllowedCommands: splitList(env[SUPPLY_CHAIN_ENV_NAMES.templateAllowedCommands]),
    templateAllowPostInstall: isTrue(env[SUPPLY_CHAIN_ENV_NAMES.templateAllowPostInstall]),
    // A single key in the env; additional keys can be added via the trusted
    // caller option or ~/.cowork/plugin-keys.json (see pluginSignature.ts).
    pluginTrustedKeys: key ? [key] : [],
  };
}

/** Trusted overrides win over the environment (used by tests and CLI callers). */
export function mergeSupplyChainPolicy(
  overrides?: Partial<SupplyChainPolicy>,
  env: NodeJS.ProcessEnv = process.env,
): SupplyChainPolicy {
  const base = resolveSupplyChainPolicy(env);
  if (!overrides) return base;
  return {
    mcpAllowedCommands: overrides.mcpAllowedCommands ?? base.mcpAllowedCommands,
    mcpAllowedServerNames: overrides.mcpAllowedServerNames ?? base.mcpAllowedServerNames,
    templateAllowedCommands: overrides.templateAllowedCommands ?? base.templateAllowedCommands,
    templateAllowPostInstall: overrides.templateAllowPostInstall ?? base.templateAllowPostInstall,
    pluginTrustedKeys: overrides.pluginTrustedKeys ?? base.pluginTrustedKeys,
  };
}
