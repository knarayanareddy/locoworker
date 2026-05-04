import type { SimulationState, SimulationReport } from "./types";
export declare class ReportGenerator {
    private engine;
    constructor(state: SimulationState);
    generate(state: SimulationState): Promise<SimulationReport>;
    private computeBeliefDistribution;
    private formatMarkdown;
}
//# sourceMappingURL=ReportGenerator.d.ts.map