export const PRICING = {
    // Anthropic
    "claude-opus-4-5": { inputPerMillion: 15.00, outputPerMillion: 75.00 },
    "claude-sonnet-4-5": { inputPerMillion: 3.00, outputPerMillion: 15.00 },
    "claude-haiku-3-5": { inputPerMillion: 0.80, outputPerMillion: 4.00 },
    // OpenAI
    "gpt-4o": { inputPerMillion: 5.00, outputPerMillion: 15.00 },
    "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.60 },
    "gpt-4-turbo": { inputPerMillion: 10.00, outputPerMillion: 30.00 },
    // DeepSeek
    "deepseek-coder": { inputPerMillion: 0.14, outputPerMillion: 0.28 },
    "deepseek-chat": { inputPerMillion: 0.14, outputPerMillion: 0.28 },
    // Local (free)
    "qwen2.5-coder:7b": { inputPerMillion: 0, outputPerMillion: 0 },
    "llama3.2": { inputPerMillion: 0, outputPerMillion: 0 },
    "mistral": { inputPerMillion: 0, outputPerMillion: 0 },
};
export function getPricing(model) {
    // exact match
    if (PRICING[model])
        return PRICING[model];
    // prefix match (e.g. "claude-sonnet-4-5-20241022" → "claude-sonnet-4-5")
    for (const [key, pricing] of Object.entries(PRICING)) {
        if (model.startsWith(key))
            return pricing;
    }
    // unknown model = free (local)
    return { inputPerMillion: 0, outputPerMillion: 0 };
}
export function calculateCost(model, inputTokens, outputTokens) {
    const pricing = getPricing(model);
    return ((inputTokens / 1_000_000) * pricing.inputPerMillion +
        (outputTokens / 1_000_000) * pricing.outputPerMillion);
}
export function formatCost(usd) {
    if (usd === 0)
        return "$0.00 (local)";
    if (usd < 0.001)
        return `$${(usd * 1000).toFixed(4)}m`;
    if (usd < 0.01)
        return `$${usd.toFixed(5)}`;
    return `$${usd.toFixed(4)}`;
}
//# sourceMappingURL=pricing.js.map