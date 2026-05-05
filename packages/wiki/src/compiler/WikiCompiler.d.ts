import type { WikiPage } from "../store/types.js";
import type { WikiStore } from "../store/WikiStore.js";
/**
 * WikiCompiler takes raw sources added to a wiki page and uses the
 * agent's model to generate/update the structured wiki article body.
 *
 * It calls a provided "compile" function (injected from core's QueryEngine)
 * so it remains decoupled from the provider layer.
 */
export type CompileFn = (prompt: string) => Promise<string>;
export declare class WikiCompiler {
    private store;
    private compile;
    constructor(store: WikiStore, compile: CompileFn);
    compilePage(pageId: string): Promise<WikiPage | null>;
    compileAll(): Promise<number>;
}
//# sourceMappingURL=WikiCompiler.d.ts.map