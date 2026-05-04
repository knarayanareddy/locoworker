/**
 * Optional embedding client. Talks to any OpenAI-compatible /v1/embeddings
 * endpoint (Ollama exposes one, OpenAI itself, LM Studio, etc).
 *
 * If the endpoint isn't reachable we silently fall back to BM25-only —
 * vector search is an enhancement, not a hard requirement.
 */
export class Embedder {
    config;
    constructor(config) {
        this.config = config;
    }
    async embed(text) {
        return this.embedOne(text);
    }
    async embedBatch(texts) {
        return Promise.all(texts.map((t) => this.embedOne(t)));
    }
    async embedOne(text) {
        try {
            const res = await fetch(`${stripSlash(this.config.baseUrl)}/embeddings`, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}),
                },
                body: JSON.stringify({ model: this.config.model, input: text }),
                signal: AbortSignal.timeout(8_000),
            });
            if (!res.ok)
                return null;
            const data = (await res.json());
            return data.data?.[0]?.embedding ?? null;
        }
        catch {
            return null;
        }
    }
}
export function cosineSimilarity(a, b) {
    if (a.length !== b.length)
        return 0;
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length; i++) {
        const ai = a[i] ?? 0;
        const bi = b[i] ?? 0;
        dot += ai * bi;
        na += ai * ai;
        nb += bi * bi;
    }
    if (na === 0 || nb === 0)
        return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
function stripSlash(url) {
    return url.endsWith("/") ? url.slice(0, -1) : url;
}
//# sourceMappingURL=Embedder.js.map