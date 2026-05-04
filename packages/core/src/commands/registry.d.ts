import type { SlashCommand, SlashCommandContext, SlashOutput } from "./SlashCommand.js";
export declare class SlashRegistry {
    private commands;
    register(cmd: SlashCommand): void;
    registerAll(cmds: SlashCommand[]): void;
    list(): SlashCommand[];
    /** Match either by exact name or shortest unique prefix. */
    resolve(name: string): SlashCommand | null;
    dispatch(line: string, ctx: SlashCommandContext): Promise<SlashOutput | null>;
}
export declare function defaultRegistry(): SlashRegistry;
//# sourceMappingURL=registry.d.ts.map