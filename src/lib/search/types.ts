/** Browser-safe search contracts. Times are present only when supplied by transcription. */
export interface SemanticSearchInput {
    query: string;
    page?: number;
    pageSize?: number;
    contactId?: string;
    startDate?: string;
    endDate?: string;
}

export interface SemanticSearchMatch {
    text: string;
    segmentIndex: number;
    start?: number;
    end?: number;
    transcriptRevision: string;
}

export interface SearchCoverage {
    ready: number;
    pending: number;
    failed: number;
    total: number;
}

export type SearchIndexingScope = Pick<SemanticSearchInput, 'contactId' | 'startDate' | 'endDate'>;
export interface SearchIndexingStatus {
    eligible: number;
    available?: number;
    queued: number;
    running: number;
    needsReview: number;
    ready: boolean;
    message: string;
    batchSize: number;
}

export interface RecordingSearchIndex {
    generation: string;
    transcriptRevision: string;
    profileId: string;
    state: 'pending' | 'indexing' | 'ready' | 'failed';
    totalPassages: number;
    completedPassages: number;
}

export interface PassageSource {
    segmentIndex: number;
    /** UTF-16 offsets in the original segment, end exclusive. */
    from: number;
    to: number;
}

export interface EmbeddingProfile {
    id: string;
    provider: 'gemini' | 'openai_compat';
    model: string;
    dimensions: number;
    adapterVersion: 1;
    chunkerVersion: 1;
    countBasis: 'provider_tokenizer' | 'utf8_byte_bound';
}

export interface TranscriptPassage {
    ordinal: number;
    text: string;
    sources: PassageSource[];
    start?: number;
    end?: number;
    inputTokens: number;
}
