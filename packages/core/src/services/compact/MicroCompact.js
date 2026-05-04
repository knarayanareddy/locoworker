/**
 * Layer 1 compression: trim large tool outputs in-place. No model call.
 * Triggered after every tool execution. Keeps the head and tail (the
 * informative parts) and drops the middle.
 */
const DEFAULT_MAX = 8_000;
const HEAD_RATIO = 0.6;
export function microCompact(content, opts = {}) {
    const max = opts.maxChars ?? DEFAULT_MAX;
    const headRatio = opts.headRatio ?? HEAD_RATIO;
    if (content.length <= max)
        return content;
    const dropped = content.length - max;
    const headChars = Math.floor((max - 80) * headRatio);
    const tailChars = max - 80 - headChars;
    const head = content.slice(0, headChars);
    const tail = content.slice(-tailChars);
    return `${head}\n\n[… ${dropped} chars elided by MicroCompact …]\n\n${tail}`;
}
export function microCompactToolResult(result, opts) {
    return microCompact(result, opts);
}
//# sourceMappingURL=MicroCompact.js.map