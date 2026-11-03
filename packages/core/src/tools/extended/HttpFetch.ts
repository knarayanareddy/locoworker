import type { ToolDefinition } from "../../Tool.js";
import { PermissionLevel } from "../../permissions/PermissionLevel.js";
import { NetworkSandbox } from "@cowork/security/sandbox";

const MAX_RESPONSE_CHARS = 50_000;
const SAFE_METHODS = new Set(["GET", "HEAD"]);

export const HttpFetch: ToolDefinition = {
  name: "HttpFetch",
  description:
    "Fetch a public URL (GET/HEAD). Network access is restricted by the allowlist and private addresses are blocked. Requires approval for non-GET requests.",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string" },
      method: { type: "string", default: "GET" },
      headers: { type: "object", additionalProperties: { type: "string" } },
      body: { type: "string" },
    },
    required: ["url"],
  },
  // This tool can reach the network; require approval rather than treating it
  // like a local read.
  permissionLevel: PermissionLevel.ELEVATED,
  requiresApproval: true,
  async execute(input: { url: string; method?: string; headers?: any; body?: string }, ctx) {
    const method = (input.method ?? "GET").toUpperCase();
    if (!SAFE_METHODS.has(method)) {
      return { content: `Unsafe HTTP method "${method}" is not permitted`, isError: true };
    }

    const sandbox = new NetworkSandbox({
      enabled: ctx.settings?.sandboxEnabled ?? process.env.COWORK_SANDBOX_ENABLED === "true",
      allowlist: ctx.settings?.sandboxAllowlist ??
        (process.env.COWORK_SANDBOX_ALLOWLIST ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    });
    try {
      sandbox.assertAllowed(input.url, "HttpFetch");
    } catch (e) {
      return { content: (e as Error).message, isError: true };
    }

    try {
      const res = await fetch(input.url, {
        method,
        headers: input.headers,
        // Never follow redirects: an allowlisted host could redirect to a
        // private address and bypass the check.
        redirect: "manual",
      });
      if (res.status >= 300 && res.status < 400) {
        return { content: `Redirect (${res.status}) blocked by network sandbox`, isError: true };
      }
      const text = await res.text();
      return {
        content: `Status: ${res.status}\n\n${text.slice(0, MAX_RESPONSE_CHARS)}`,
        isError: !res.ok,
      };
    } catch (err) {
      return { content: String(err), isError: true };
    }
  },
};
