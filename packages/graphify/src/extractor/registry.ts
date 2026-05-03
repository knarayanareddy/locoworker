import { extname } from "node:path";
import type { Extractor } from "./Extractor.js";
import { TypeScriptExtractor } from "./TypeScriptExtractor.js";
import { PythonExtractor } from "./PythonExtractor.js";
import { MarkdownExtractor } from "./MarkdownExtractor.js";

export class ExtractorRegistry {
  private byExt = new Map<string, Extractor>();
  private extractors: Extractor[] = [];

  register(extractor: Extractor): void {
    this.extractors.push(extractor);
    for (const ext of extractor.extensions) {
      this.byExt.set(ext.toLowerCase(), extractor);
    }
  }

  resolve(filePath: string): Extractor | null {
    return this.byExt.get(extname(filePath).toLowerCase()) ?? null;
  }

  knownExtensions(): string[] {
    return Array.from(this.byExt.keys()).sort();
  }

  list(): Extractor[] {
    return [...this.extractors];
  }
}

export function defaultRegistry(): ExtractorRegistry {
  const registry = new ExtractorRegistry();
  registry.register(new TypeScriptExtractor());
  registry.register(new PythonExtractor());
  registry.register(new MarkdownExtractor());
  return registry;
}
