/**
 * Per-million-token pricing table.
 * Update as providers change pricing.
 * Format: [inputCostPer1M, outputCostPer1M] in USD.
 */
export declare const PRICING_TABLE: Record<string, [number, number]>;
export declare function estimateCost(model: string, inputTokens: number, outputTokens: number): number;
//# sourceMappingURL=pricing.d.ts.map