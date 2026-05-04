/**
 * Append-only daily transcript log. AutoDream consumes recent transcripts
 * to find new memories worth saving and contradictions worth resolving.
 */
export declare class TranscriptLog {
    private readonly root;
    constructor(root: string);
    private pathFor;
    append(sessionId: string, role: string, content: string): Promise<void>;
}
//# sourceMappingURL=Transcript.d.ts.map