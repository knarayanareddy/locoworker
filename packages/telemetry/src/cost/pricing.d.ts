/**
 * Token pricing table.
 * Units: USD per million tokens.
 * Updated as of 2025-Q2 — add models as needed.
 */
export interface ModelPricing {
    inputPerMillion: number;
    outputPerMillion: number;
}
export declare const PRICING: Record<string, ModelPricing>;
export declare function getPricing(model: string): ModelPricing;
export declare function calculateCost(model: string, inputTokens: number, outputTokens: number): number;
export declare function formatCost(usd: number): string;
//# sourceMappingURL=pricing.d.ts.map