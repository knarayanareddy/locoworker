/**
 * REPL autocomplete for slash commands and tool names.
 */

export interface AutocompleteContext {
  slashCommands: string[];
  toolNames: string[];
  memoryTags: string[];
}

export interface AutocompleteResult {
  completions: string[];
  prefix: string;
}

export class Autocomplete {
  private context: AutocompleteContext;

  constructor(context: AutocompleteContext) {
    this.context = context;
  }

  complete(input: string): AutocompleteResult {
    const trimmed = input.trimStart();

    // Slash command completion
    if (trimmed.startsWith("/")) {
      const typed = trimmed.slice(1).split(/\s/)[0];
      const completions = this.context.slashCommands
        .filter((cmd) => cmd.startsWith(typed))
        .map((cmd) => `/${cmd}`);
      return { completions, prefix: `/${typed}` };
    }

    // Tool name completion for "Use the X tool" patterns
    if (/use the \w*$/i.test(trimmed)) {
      const typed = trimmed.match(/use the (\w*)$/i)?.[1] ?? "";
      const completions = this.context.toolNames
        .filter((t) => t.toLowerCase().startsWith(typed.toLowerCase()));
      return { completions, prefix: typed };
    }

    return { completions: [], prefix: "" };
  }

  updateContext(context: Partial<AutocompleteContext>): void {
    Object.assign(this.context, context);
  }
}
