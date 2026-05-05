export interface WikiPage {
  id: string;
  title: string;
  slug: string;
  /** Raw source material (user-added facts, scraped docs, etc.) */
  sources: string[];
  /** The compiled wiki article text — generated/updated by WikiCompiler */
  body: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  compiledAt?: string;
  /** How many times this page has been read by the agent */
  readCount: number;
  /** Confidence score 0–1 set by the compiler */
  confidence: number;
}

export interface WikiSearchResult {
  page: WikiPage;
  score: number;
  via: "title" | "body" | "tag" | "combined";
}
