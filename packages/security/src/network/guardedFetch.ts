/**
 * The only supported way to make an outbound HTTP request in locoworker.
 *
 * Plain `fetch()` re-resolves DNS at connect time, follows redirects by
 * default and has no byte cap. This helper:
 *   - enforces the NetworkSandbox allowlist + full special-use IP blocking;
 *   - resolves DNS once, validates every answer, and **pins** those addresses
 *     for the actual connection (no rebinding TOCTOU window);
 *   - never follows redirects implicitly (each hop must be re-validated);
 *   - caps response bytes and enforces a timeout;
 *   - works with string, Buffer and FormData bodies via `Request`.
 *
 * `allowPrivate: true` is an explicit escape hatch for user-configured local
 * endpoints (Ollama, local Whisper, our own Hermes health endpoint). It must
 * never be used for a URL supplied by a model, a plugin registry or a repo.
 */
import http from "node:http";
import https from "node:https";
import { NetworkSandbox, type PinnedAddress } from "../sandbox/NetworkSandbox.js";

export const DEFAULT_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
export const DEFAULT_TIMEOUT_MS = 30_000;

export interface GuardedFetchOptions {
  /** Defaults to NetworkSandbox.default() (env-driven). */
  sandbox?: NetworkSandbox;
  /** Label used in security errors and logs. */
  context?: string;
  maxResponseBytes?: number;
  timeoutMs?: number;
  /** Re-validated redirect hops for GET/HEAD requests only. Default 0. */
  maxRedirects?: number;
  /** Opt out of private-address blocking for explicitly trusted local endpoints. */
  allowPrivate?: boolean;
}

function sandboxFor(options: GuardedFetchOptions): NetworkSandbox {
  if (options.sandbox) return options.sandbox;
  if (options.allowPrivate) {
    return new NetworkSandbox({ enabled: false, allowlist: [], blockPrivateHosts: false });
  }
  return NetworkSandbox.default();
}

function toHeaders(source: Record<string, string | string[] | undefined>): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const item of value) headers.append(key, item);
    else headers.set(key, value);
  }
  return headers;
}

async function requestOnce(
  url: string,
  init: RequestInit,
  sandbox: NetworkSandbox,
  context: string,
  maxResponseBytes: number,
  timeoutMs: number,
): Promise<Response> {
  sandbox.assertAllowed(url, context);
  const pinned: PinnedAddress[] = await sandbox.resolvePinnedAddresses(url, context);
  const parsed = new URL(url);
  const request = new Request(url, init);

  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => { headers[key] = value; });
  headers["host"] = parsed.host; // always explicit, never derived from Host input

  let body: Buffer | undefined;
  if (request.method !== "GET" && request.method !== "HEAD" && request.body) {
    body = Buffer.from(await request.arrayBuffer());
    if (!headers["content-length"]) headers["content-length"] = String(body.byteLength);
  }

  const transport = parsed.protocol === "https:" ? https : http;
  const signal = init.signal ?? undefined;

  return new Promise<Response>((resolve, reject) => {
    const req = transport.request(
      {
        hostname: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80,
        path: `${parsed.pathname}${parsed.search}`,
        method: request.method,
        headers,
        servername: parsed.hostname,
        timeout: timeoutMs,
        // Pin DNS: the socket connects only to addresses we already validated.
        lookup: ((_hostname: string, opts: { all?: boolean }, cb: (err: Error | null, address?: any, family?: number) => void) => {
          if (opts?.all) {
            cb(null, pinned.map((p) => ({ address: p.address, family: p.family })));
          } else {
            cb(null, pinned[0].address, pinned[0].family);
          }
        }) as any,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        let failed = false;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxResponseBytes) {
            failed = true;
            req.destroy(new Error(`[security] ${context}: response exceeded ${maxResponseBytes} bytes`));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          if (failed) return;
          const status = res.statusCode ?? 502;
          const responseHeaders = toHeaders(res.headers);
          const noBody = request.method === "HEAD" || status === 204 || status === 205 || status === 304;
          resolve(
            new Response(noBody ? null : new Uint8Array(Buffer.concat(chunks)), {
              status,
              statusText: res.statusMessage ?? "",
              headers: responseHeaders,
            }),
          );
        });
        res.on("error", reject);
      },
    );

    req.on("timeout", () => req.destroy(new Error(`[security] ${context}: request timed out`)));
    req.on("error", reject);
    if (signal) {
      if (signal.aborted) req.destroy(new Error("Request aborted"));
      else signal.addEventListener("abort", () => req.destroy(new Error("Request aborted")), { once: true });
    }
    if (body) req.write(body);
    req.end();
  });
}

export async function guardedFetch(
  url: string,
  init: RequestInit = {},
  options: GuardedFetchOptions = {},
): Promise<Response> {
  const sandbox = sandboxFor(options);
  const context = options.context ?? "guardedFetch";
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? 0;
  const canRedirect = init.method === undefined || init.method === "GET" || init.method === "HEAD";

  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const response = await requestOnce(current, init, sandbox, context, maxResponseBytes, timeoutMs);
    if (response.status < 300 || response.status >= 400 || hop === maxRedirects || !canRedirect) {
      return response;
    }
    const location = response.headers.get("location");
    if (!location) return response;
    const next = new URL(location, current).toString();
    // Re-validate the hop before use (requestOnce asserts again, but do it
    // here too so a bad Location is never even parsed into a request).
    sandbox.assertAllowed(next, `${context}/redirect`);
    current = next;
  }
  return new Response(null, { status: 508 });
}
