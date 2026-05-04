import type { WikiPage, WikiIndex, LLMWikiConfig } from "./types";
export declare class LLMWiki {
    private config;
    constructor(config: LLMWikiConfig);
    getPage(slug: string): Promise<WikiPage | null>;
    listPages(): Promise<WikiIndex["pages"]>;
    search(query: string): Promise<WikiPage[]>;
    upsertPage(slug: string, data: Omit<WikiPage, "slug" | "version" | "createdAt" | "updatedAt">): Promise<WikiPage>;
    deletePage(slug: string): Promise<boolean>;
    /**
     * Called by KAIROS daemon — converts each reference-type memory entry
     * into a wiki page if it doesn't already exist or is stale.
     */
    syncFromMemory(): Promise<{
        created: number;
        updated: number;
    }>;
    private pagePath;
    private getAllPages;
    private loadIndex;
    private rebuildIndex;
}
//# sourceMappingURL=LLMWiki.d.ts.map