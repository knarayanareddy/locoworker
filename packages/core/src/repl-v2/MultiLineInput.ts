/**
 * Multi-line input handler for the REPL.
 * Triggered when input ends with \ or when inside a triple-backtick block.
 */

export class MultiLineInput {
  private buffer: string[] = [];
  private inCodeBlock = false;

  isActive(): boolean {
    return this.inCodeBlock || this.buffer.length > 0;
  }

  process(line: string): { complete: boolean; prompt: string } {
    // Toggle code block mode on ```
    if (line.trim() === "```") {
      this.inCodeBlock = !this.inCodeBlock;
      this.buffer.push(line);
      return {
        complete: !this.inCodeBlock && this.buffer.length > 0,
        prompt: this.inCodeBlock ? "... " : "..> ",
      };
    }

    // Continuation line (ends with backslash)
    if (line.endsWith("\\")) {
      this.buffer.push(line.slice(0, -1)); // strip trailing \
      return { complete: false, prompt: "..> " };
    }

    this.buffer.push(line);

    if (this.inCodeBlock) {
      return { complete: false, prompt: "... " };
    }

    return { complete: true, prompt: "⚡ " };
  }

  flush(): string {
    const result = this.buffer.join("\n");
    this.buffer = [];
    this.inCodeBlock = false;
    return result;
  }

  clear(): void {
    this.buffer = [];
    this.inCodeBlock = false;
  }
}
