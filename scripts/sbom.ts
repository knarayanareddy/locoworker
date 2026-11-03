/**
 * Generate a CycloneDX 1.6 SBOM from bun.lock.
 *
 * bun.lock is JSONC (trailing commas), so strip those before parsing. Each
 * resolved package becomes a component with a package-url and, where present,
 * its SHA-512 integrity hash. The output is a generated artifact and is
 * gitignored; CI uploads it for external vulnerability scanning.
 */
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const OUTPUT = resolve(ROOT, "sbom.cdx.json");

const raw = await readFile(resolve(ROOT, "bun.lock"), "utf8");
const lock = JSON.parse(raw.replace(/,(\s*[}\]])/g, "$1")) as {
  lockfileVersion?: number;
  workspaces?: Record<string, unknown>;
  packages?: Record<string, unknown>;
};

const components: Array<Record<string, unknown>> = [];
const seen = new Set<string>();

for (const [key, value] of Object.entries(lock.packages ?? {})) {
  const entry = Array.isArray(value) ? value : null;
  if (!entry || typeof entry[0] !== "string") continue;
  const spec = entry[0] as string;
  // Scoped names contain one leading @; split at the last @ that follows the name.
  const match = /^(@[^/]+\/[^@]+|[^@]+)@(.+)$/.exec(spec);
  if (!match) continue;
  const [, name, version] = match;
  const bomRef = `pkg:npm/${name}@${version}`;
  if (seen.has(bomRef)) continue;
  seen.add(bomRef);
  const integrity = typeof entry[3] === "string" ? (entry[3] as string) : "";
  const component: Record<string, unknown> = {
    type: "library",
    "bom-ref": bomRef,
    name,
    version,
    purl: bomRef,
  };
  const sha = /^sha512-(.+)$/.exec(integrity)?.[1];
  if (sha) component.hashes = [{ alg: "SHA-512", content: sha }];
  components.push(component);
}

components.sort((a, b) => String(a["bom-ref"]).localeCompare(String(b["bom-ref"])));

const bom = {
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  serialNumber: `urn:uuid:${randomUUID()}`,
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    tools: [{ vendor: "locoworker", name: "bun.lock SBOM generator", version: "1.0.0" }],
    component: { type: "application", name: "locoworker", version: "0.1.0" },
  },
  components,
};

await writeFile(OUTPUT, JSON.stringify(bom, null, 2) + "\n", "utf8");
process.stdout.write(`[sbom] wrote ${OUTPUT} with ${components.length} components\n`);
