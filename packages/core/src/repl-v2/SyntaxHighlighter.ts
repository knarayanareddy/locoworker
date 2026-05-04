/**
 * Minimal ANSI syntax highlighter for REPL output.
 * Highlights: tool names, file paths, code blocks, success/error markers.
 */

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
  white: "\x1b[37m",
} as const;

export type ColorTheme = "dark" | "light" | "none";

export class SyntaxHighlighter {
  private theme: ColorTheme;
  private toolNames: Set<string>;

  constructor(theme: ColorTheme = "dark", toolNames: string[] = []) {
    this.theme = theme;
    this.toolNames = new Set(toolNames);
  }

  highlight(text: string): string {
    if (this.theme === "none") return text;

    let result = text;

    // ── Code blocks ─────────────────────────────────────────────────────────
    result = result.replace(
      /```(\w*)\n([\s\S]*?)```/g,
      (_, lang, code) =>
        `${ANSI.gray}[${lang || "code"}]${ANSI.reset}\n${ANSI.cyan}${code}${ANSI.reset}`
    );

    // ── Inline code ──────────────────────────────────────────────────────────
    result = result.replace(
      /`([^`\n]+)`/g,
      (_, code) => `${ANSI.cyan}${code}${ANSI.reset}`
    );

    // ── Bold headings ────────────────────────────────────────────────────────
    result = result.replace(
      /^(#{1,3})\s+(.+)$/gm,
      (_, hashes, title) =>
        `${ANSI.bold}${ANSI.blue}${hashes} ${title}${ANSI.reset}`
    );

    // ── Bold **text** ────────────────────────────────────────────────────────
    result = result.replace(
      /\*\*([^*]+)\*\*/g,
      (_, text) => `${ANSI.bold}${text}${ANSI.reset}`
    );

    // ── File paths ───────────────────────────────────────────────────────────
    result = result.replace(
      /((?:\/[\w.-]+)+\/?)/g,
      (path) => `${ANSI.yellow}${path}${ANSI.reset}`
    );

    // ── Tool names ───────────────────────────────────────────────────────────
    for (const tool of this.toolNames) {
      const escaped = tool.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      result = result.replace(
        new RegExp(`\\b${escaped}\\b`, "g"),
        `${ANSI.magenta}${tool}${ANSI.reset}`
      );
    }

    // ── Success/error markers ─────────────────────────────────────────────────
    result = result.replace(
      /^(✅|✓|done|success|complete)/gim,
      (m) => `${ANSI.green}${m}${ANSI.reset}`
    );
    result = result.replace(
      /^(❌|✗|error|failed|failure)/gim,
      (m) => `${ANSI.red}${m}${ANSI.reset}`
    );

    return result;
  }

  prompt(text: string): string {
    if (this.theme === "none") return text;
    return `${ANSI.bold}${ANSI.blue}${text}${ANSI.reset}`;
  }

  dim(text: string): string {
    if (this.theme === "none") return text;
    return `${ANSI.dim}${text}${ANSI.reset}`;
  }

  error(text: string): string {
    if (this.theme === "none") return text;
    return `${ANSI.red}${text}${ANSI.reset}`;
  }

  success(text: string): string {
    if (this.theme === "none") return text;
    return `${ANSI.green}${text}${ANSI.reset}`;
  }
}
