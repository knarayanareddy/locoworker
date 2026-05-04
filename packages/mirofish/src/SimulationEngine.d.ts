import type { SimulationConfig, SimulationState, SimAction } from "./types";
export declare class SimulationEngine {
    private config;
    private engine;
    private factory;
    state: SimulationState;
    constructor(config: SimulationConfig);
    run(onRoundComplete?: (round: number, actions: SimAction[]) => void): Promise<SimulationState>;
    private simulateRound;
    private agentTurn;
    private propagateBeliefs;
    private agentName;
}
//# sourceMappingURL=SimulationEngine.d.ts.map