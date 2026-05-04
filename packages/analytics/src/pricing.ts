/**
 * Per-million-token pricing table.
 * Update as providers change pricing.
 * Format: [inputCostPer1M, outputCostPer1M] in USD.
 */
export const PRICING_TABLE: Record<string, [number, number]> = {
  // Anthropic
  "claude-opus-4":       [15.00,  75.00],
  "claude-sonnet-4":     [ 3.00,  15.00],
  "claude-haiku-3-5":    [ 0.80,   4.00],
  // OpenAI
  "gpt-4o":              [ 2.50,  10.00],
  "gpt-4o-mini":         [ 0.15,   0.60],
  "o1":                  [15.00,  60.00],
  "o3-mini":             [ 1.10,   4.40],
  // DeepSeek
  "deepseek-chat":       [ 0.014,  0.28],
  "deepseek-coder":      [ 0.014,  0.28],
  // Free/local
  "ollama":              [0, 0],
  "lmstudio":            [0, 0],
};

export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  // Try exact match first, then partial match
  const pricing =
    PRICING_TABLE[model] ??
    Object.entries(PRICING_TABLE).find(([k]) => model.includes(k))?.[1] ??
    [0, 0];
  return (inputTokens / 1_000_000) * pricing[0] + (outputTokens / 1_000_000) * pricing[1];
}
