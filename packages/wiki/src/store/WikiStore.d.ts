import type { WikiPage, WikiSearchResult } from "./types.js";
export declare class WikiStore {
    private wikiDir;
    constructor(projectRoot: string);
    init(): Promise<void>;
    create(opts: {
        title: string;
        sources?: string[];
        body?: string;
        tags?: string[];
        confidence?: number;
    }): Promise<WikiPage>;
    update(id: string, patch: Partial<WikiPage>): Promise<WikiPage | null>;
    upsertPage(slug: string, opts: {
        title: string;
        body: string;
        tags: string[];
        sourceMemoryIds: string[];
    }): Promise<WikiPage>;
    getById(id: string): Promise<WikiPage | null>;
    getBySlug(slug: string): Promise<WikiPage | null>;
    list(): Promise<WikiPage[]>;
    delete(id: string): Promise<boolean>;
    search(query: string, limit?: number): Promise<WikiSearchResult[]>;
    incrementReadCount(id: string): Promise<void>;
    /** Export the entire wiki as a WIKI_INDEX.md for agent consumption */
    exportIndex(): Promise<string>;
    private save;
}
//# sourceMappingURL=WikiStore.d.ts.map