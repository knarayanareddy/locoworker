import type { Extractor } from "./types";
import { TypeScriptExtractor } from "./TypeScriptExtractor";
import { PythonExtractor } from "./PythonExtractor";
import { MarkdownExtractor } from "./MarkdownExtractor";

export class ExtractorRegistry {
  private extractors = new Map<string, Extractor>();

  constructor() {
    this.register([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"], new (TypeScriptExtractor as any)());
    this.register([".py"], new (PythonExtractor as any)());
    this.register([".md", ".mdx"], new (MarkdownExtractor as any)());
  }

  register(extensions: string[], extractor: Extractor): void {
    for (const ext of extensions) {
      this.extractors.set(ext, extractor);
    }
  }

  getExtractor(ext: string): Extractor | undefined {
    return this.extractors.get(ext.toLowerCase());
  }

  resolve(filePath: string): Extractor | undefined {
    const ext = filePath.includes(".") ? "." + filePath.split(".").pop() : "";
    return this.getExtractor(ext);
  }

  supportedExtensions(): string[] {
    return [...this.extractors.keys()];
  }
}
