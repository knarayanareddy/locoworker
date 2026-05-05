export class WikiCompiler {
    store;
    compile;
    constructor(store, compile) {
        this.store = store;
        this.compile = compile;
    }
    async compilePage(pageId) {
        const page = await this.store.getById(pageId);
        if (!page)
            return null;
        if (page.sources.length === 0)
            return page;
        const sourcesText = page.sources
            .map((s, i) => `### Source ${i + 1}\n${s}`)
            .join("\n\n");
        const prompt = [
            `You are a technical knowledge compiler. Your job is to synthesize the following raw source material into a clean, accurate, well-structured wiki article.`,
            ``,
            `Title: ${page.title}`,
            `Tags: ${page.tags.join(", ")}`,
            ``,
            `## Raw Sources`,
            sourcesText,
            ``,
            `## Instructions`,
            `Write a concise, factual wiki article based on the sources above.`,
            `Use markdown. Include a brief summary paragraph, then structured sections.`,
            `Do not invent facts not present in the sources.`,
            `End with a confidence score on a line like: CONFIDENCE: 0.85`,
        ].join("\n");
        try {
            const output = await this.compile(prompt);
            // Extract confidence score
            const confMatch = output.match(/CONFIDENCE:\s*([\d.]+)/i);
            const confidence = confMatch ? Math.min(1, Math.max(0, parseFloat(confMatch[1]))) : 0.7;
            const body = output.replace(/CONFIDENCE:.*$/im, "").trim();
            return await this.store.update(pageId, {
                body,
                confidence,
                compiledAt: new Date().toISOString(),
            });
        }
        catch {
            return page;
        }
    }
    async compileAll() {
        const pages = await this.store.list();
        let compiled = 0;
        for (const page of pages) {
            if (page.sources.length > 0) {
                const result = await this.compilePage(page.id);
                if (result)
                    compiled++;
            }
        }
        return compiled;
    }
}
//# sourceMappingURL=WikiCompiler.js.map