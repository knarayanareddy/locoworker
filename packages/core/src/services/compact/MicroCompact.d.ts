/**
 * Layer 1 compression: trim large tool outputs in-place. No model call.
 * Triggered after every tool execution. Keeps the head and tail (the
 * informative parts) and drops the middle.
 */
export type MicroCompactOptions = {
    maxChars?: number;
    /** When trimming, what fraction of the budget goes to the start vs end. */
    headRatio?: number;
};
export declare function microCompact(content: string, opts?: MicroCompactOptions): string;
export declare function microCompactToolResult(result: string, opts?: MicroCompactOptions): string;
//# sourceMappingURL=MicroCompact.d.ts.map