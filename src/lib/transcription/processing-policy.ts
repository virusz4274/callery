/** Immutable service limits shared by transcription and bundled AI execution.
 * These describe supported requests, independently of billing or provider prices.
 */
export interface ProcessingTranscriptEnvelope {
    maxResponseBytes: number;
    maxSourceTextBytes: number;
    maxSegments: number;
    maxWords: number;
    maxSummaryLeaves: number;
    maxReduceLevels: number;
    maxTransliterationChunks: number;
    maxAsrOutputTokens?: number;
}

export interface ProcessingAiModel {
    provider: string;
    model: string;
}

export type AiPlannerVersion = 1 | 2;
export const CURRENT_AI_PLANNER_VERSION: AiPlannerVersion = 2;
