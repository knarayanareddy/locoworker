/**
 * Repo-local Bun security scanner (bunfig.toml -> [install.security]).
 *
 * Bun calls scan() with every resolved package during `bun install`,
 * `bun add` and `bun pm scan`. We enforce a small, versioned offline policy
 * (security/advisories.json) and fail the install on `fatal` findings. This
 * is deliberately offline/CI-deterministic; the CycloneDX SBOM produced by
 * `bun run sbom` is the artefact to feed to a live CVE service.
 *
 * Docs: https://bun.sh/docs/pm/security-scanner-api
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

type Level = "fatal" | "warn";
type Rule = {
  package: string;
  range: string;
  level: Level;
  url: string;
  description: string;
};
type Policy = { rules: Rule[]; flagLatestRanges?: boolean };

async function loadPolicy(root: string): Promise<Policy> {
  try {
    return JSON.parse(await readFile(join(root, "security", "advisories.json"), "utf8")) as Policy;
  } catch {
    // A missing/invalid policy must fail closed rather than silently skip.
    throw new Error("[security] cannot load security/advisories.json — refusing to install unscanned packages");
  }
}

export const scanner: Bun.Security.Scanner = {
  version: "1",
  async scan({ packages }) {
    const root = process.cwd();
    const policy = await loadPolicy(root);
    const advisories: Bun.Security.Advisory[] = [];

    for (const pkg of packages) {
      for (const rule of policy.rules) {
        if (rule.package !== pkg.name) continue;
        const matches = rule.range === "*" || Bun.semver.satisfies(pkg.version, rule.range);
        if (!matches) continue;
        advisories.push({
          level: rule.level,
          package: pkg.name,
          url: rule.url,
          description: `${rule.description} (resolved ${pkg.version})`,
        });
      }
      if (policy.flagLatestRanges && pkg.requestedRange === "latest") {
        advisories.push({
          level: "warn",
          package: pkg.name,
          url: "https://docs.npmjs.com/cli/v10/configuring-npm/package-json#dependencies",
          description: `"${pkg.name}" uses the non-reproducible "latest" version spec; pin an explicit range.`,
        });
      }
    }
    return advisories;
  },
};
