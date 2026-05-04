export interface WikiPage {
  slug: string;              // url-safe identifier e.g. "query-engine"
  title: string;
  body: string;              // markdown body
  tags: string[];
  createdAt: string;         // ISO
  updatedAt: string;         // ISO
  sourceMemoryIds: string[]; // which memory entries contributed
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
  wikiDir?: string;           // default: <projectRoot>/.cowork/wiki
  maxPageBodyChars?: number;  // default 8000
}
