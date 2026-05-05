import type { SimulationConfig, SimulationReport, SimulationState } from "./types";
import { SimulationEngine } from "./SimulationEngine";
import { ReportGenerator } from "./ReportGenerator";
import { MemorySystem } from "@cowork/core";
import { WikiStore } from "@cowork/wiki";
import path from "node:path";
import { mkdir } from "node:fs/promises";

export interface StudioConfig {
  projectRoot: string;
  outputDir?: string;
  saveToWiki?: boolean;
  saveToMemory?: boolean;
}

export class MiroFishStudio {
  private studioConfig: StudioConfig;

  constructor(config: StudioConfig) {
    this.studioConfig = {
      outputDir: path.join(config.projectRoot, "mirofish-out"),
      saveToWiki: true,
      saveToMemory: true,
      ...config,
    };
  }

  async run(
    simConfig: SimulationConfig,
    onProgress?: (round: number, actionCount: number) => void
  ): Promise<SimulationReport> {
    await mkdir(this.studioConfig.outputDir!, { recursive: true });

    const engine = new SimulationEngine(simConfig);
    const state = await engine.run((round, actions) => {
      onProgress?.(round, actions.length);
    });

    if (state.status === "failed") {
      throw new Error(`Simulation failed: ${state.error}`);
    }

    const reporter = new ReportGenerator(state);
    const report = await reporter.generate(state);

    // Persist outputs
    await this.persistReport(report, state);
    await this.persistToWikiAndMemory(report, simConfig);

    return report;
  }

  private async persistReport(
    report: SimulationReport,
    state: SimulationState
  ): Promise<void> {
    const base = path.join(this.studioConfig.outputDir!, report.id);

    await Bun.write(`${base}-report.md`, report.rawMarkdown);
    await Bun.write(`${base}-state.json`, JSON.stringify(state, null, 2));
    await Bun.write(`${base}-report.json`, JSON.stringify(report, null, 2));
  }

  private async persistToWikiAndMemory(
    report: SimulationReport,
    config: SimulationConfig
  ): Promise<void> {
    if (this.studioConfig.saveToWiki) {
      try {
        const wiki = new WikiStore(this.studioConfig.projectRoot);
        await wiki.upsertPage(`sim-${report.id.slice(0, 8)}`, {
          title: `Simulation: ${report.scenarioPrompt.slice(0, 60)}`,
          body: report.rawMarkdown,
          tags: ["mirofish", "simulation", config.platform],
          sourceMemoryIds: [],
        });
      } catch { /* best effort */ }
    }

    if (this.studioConfig.saveToMemory) {
      try {
        const memory = new MemorySystem({ projectRoot: this.studioConfig.projectRoot });
        await memory.save({
          type: "reference",
          name: `mirofish-sim-${report.id.slice(0, 8)}`,
          description: `MiroFish simulation: ${report.scenarioPrompt.slice(0, 80)}`,
          body: [
            `Prediction: ${report.prediction}`,
            `Narrative: ${report.dominantNarrative}`,
            `Agents: ${report.agentCount} | Rounds: ${report.rounds} | Actions: ${report.totalActions}`,
          ].join("\n"),
          tags: ["mirofish", "simulation"],
          confidence: 0.85,
          sessionId: null,
        });
      } catch { /* best effort */ }
    }
  }
}
