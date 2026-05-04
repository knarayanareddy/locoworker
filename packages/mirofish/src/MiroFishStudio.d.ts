import type { SimulationConfig, SimulationReport, SimAction } from "./types";
export interface MiroFishOptions {
    projectRoot: string;
}
export declare class MiroFishStudio {
    private projectRoot;
    constructor(options: MiroFishOptions);
    run(config: SimulationConfig, onRound?: (round: number, actions: SimAction[]) => void): Promise<SimulationReport>;
    private saveToMemory;
    private saveToWiki;
}
//# sourceMappingURL=MiroFishStudio.d.ts.map