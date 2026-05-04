/**
 * Optional embedding client. Talks to any OpenAI-compatible /v1/embeddings
 * endpoint (Ollama exposes one, OpenAI itself, LM Studio, etc).
 *
 * If the endpoint isn't reachable we silently fall back to BM25-only —
 * vector search is an enhancement, not a hard requirement.
 */
export type EmbedderConfig = {
    baseUrl: string;
    model: string;
    apiKey?: string;
};
export declare class Embedder {
    private readonly config;
    constructor(config: EmbedderConfig);
    embed(text: string): Promise<number[] | null>;
    embedBatch(texts: string[]): Promise<(number[] | null)[]>;
    private embedOne;
}
export declare function cosineSimilarity(a: number[], b: number[]): number;
//# sourceMappingURL=Embedder.d.ts.map