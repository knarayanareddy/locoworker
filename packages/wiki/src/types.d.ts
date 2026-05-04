export interface WikiPage {
    slug: string;
    title: string;
    body: string;
    tags: string[];
    createdAt: string;
    updatedAt: string;
    sourceMemoryIds: string[];
    version: number;
}
export interface WikiIndex {
    pages: Array<{
        slug: string;
        title: string;
        tags: string[];
        updatedAt: string;
        version: number;
    }>;
    generatedAt: string;
}
export interface LLMWikiConfig {
    projectRoot: string;
    wikiDir?: string;
    maxPageBodyChars?: number;
}
//# sourceMappingURL=types.d.ts.map