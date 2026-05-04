import { SimulationEngine } from "./SimulationEngine";
import { ReportGenerator } from "./ReportGenerator";
import { MemorySystem } from "@cowork/core";
import { LLMWiki } from "@cowork/wiki";
export class MiroFishStudio {
    projectRoot;
    constructor(options) {
        this.projectRoot = options.projectRoot;
    }
    async run(config, onRound) {
        const engine = new SimulationEngine(config);
        const state = await engine.run(onRound);
        const generator = new ReportGenerator(state);
        const report = await generator.generate(state);
        // Persist results
        if (process.env.COWORK_MIROFISH_SAVE_MEMORY !== "false") {
            await this.saveToMemory(report);
        }
        if (process.env.COWORK_MIROFISH_SAVE_WIKI !== "false") {
            await this.saveToWiki(report);
        }
        return report;
    }
    async saveToMemory(report) {
        const memory = new MemorySystem(this.projectRoot);
        await memory.save({
            name: `mirofish-report-${report.id}`,
            content: report.prediction,
            type: "fact",
            confidence: 0.7,
            metadata: {
                source: "mirofish",
                scenario: report.scenarioPrompt,
                reportId: report.id,
            },
        });
    }
    async saveToWiki(report) {
        try {
            const wiki = new LLMWiki({ projectRoot: this.projectRoot });
            const slug = `mirofish-report-${report.id.slice(0, 8)}`;
            await wiki.savePage({
                slug,
                title: `MiroFish: ${report.scenarioPrompt.slice(0, 50)}`,
                content: report.rawMarkdown,
            });
        }
        catch { /* wiki might not be initialized */ }
    }
}
//# sourceMappingURL=MiroFishStudio.js.map