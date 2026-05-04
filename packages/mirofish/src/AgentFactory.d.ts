import type { SimAgent, SimulationConfig } from "./types";
export declare class AgentFactory {
    private engine;
    constructor(config: SimulationConfig);
    generateAgents(seedDocument: string, count: number): Promise<SimAgent[]>;
    private buildPersonalityMix;
    private wireNetwork;
    private fallbackPersonas;
}
//# sourceMappingURL=AgentFactory.d.ts.map