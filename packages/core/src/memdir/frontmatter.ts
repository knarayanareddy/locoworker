/**
 * Tiny YAML-frontmatter codec — handles the subset we use for memory files
 * without pulling in a YAML dependency. Supports strings, numbers, booleans,
 * and string arrays (inline or block-style).
 */

export type Frontmatter = Record<string, string | number | boolean | string[]>;

export function serializeFrontmatter(fm: Frontmatter): string {
  const lines: string[] = ["---"];
  for (const [key, value] of Object.entries(fm)) {
    if (Array.isArray(value)) {
      const inline = value.map((v) => JSON.stringify(v)).join(", ");
      lines.push(`${key}: [${inline}]`);
    } else if (typeof value === "string") {
      lines.push(`${key}: ${quoteIfNeeded(value)}`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push("---", "");
  return lines.join("\n");
}

export function parseFrontmatter(input: string): {
  frontmatter: Frontmatter;
  body: string;
} {
  if (!input.startsWith("---\n") && !input.startsWith("---\r\n")) {
    return { frontmatter: {}, body: input };
  }

  const rest = input.slice(input.indexOf("\n") + 1);
  const endIdx = rest.indexOf("\n---");
  if (endIdx === -1) return { frontmatter: {}, body: input };

  const head = rest.slice(0, endIdx);
  const body = rest.slice(endIdx + 4).replace(/^\r?\n/, "");

  const fm: Frontmatter = {};
  for (const line of head.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const raw = line.slice(idx + 1).trim();
    fm[key] = parseValue(raw);
  }
  return { frontmatter: fm, body };
}

function parseValue(raw: string): string | number | boolean | string[] {
  if (raw.startsWith("[") && raw.endsWith("]")) {
    const inner = raw.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(/,\s*/).map((s) => unquote(s.trim()));
  }
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  return unquote(raw);
}

function unquote(s: string): string {
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    try {
      return JSON.parse(s.startsWith("'") ? `"${s.slice(1, -1)}"` : s);
    } catch {
      return s.slice(1, -1);
    }
  }
  return s;
}

function quoteIfNeeded(s: string): string {
  if (/[:#"\n\r\t]/.test(s) || s.trim() !== s || s === "") {
    return JSON.stringify(s);
  }
  return s;
}
