import { ProcessingPausedError } from '@/lib/processing-pause';
import { BillingSyncPendingError, OperatingFundingUnavailableError, PrepaidFundingRequiredError } from '@/lib/stripe/billing-errors';
import { classifyExternalServiceError } from '@/lib/external-service-incident-classification';

export type ProcessingStage = 'transcription' | 'summary' | 'transliteration' | 'embedding' | 'completed';
export type ProcessingState = 'running' | 'blocked' | 'failed' | 'needs_review' | 'completed';
export type ProcessingRetryAction = 'retry_transcription' | 'resume_enrichment' | 'review_provider' | 'contact_admin' | 'none';
export type ProviderOutcome = 'not_started' | 'responded' | 'unknown';

/** Public processing metadata contains no provider payload, transcript or credentials. */
export interface ProcessingStatus {
    stage: ProcessingStage;
    state: ProcessingState;
    code?: string;
    retryAction?: ProcessingRetryAction;
    providerOutcome?: ProviderOutcome;
}

export class ProcessingError extends Error {
    readonly processingStatus: ProcessingStatus;
    constructor(message: string, details: ProcessingStatus) {
        super(message);
        this.name = 'ProcessingError';
        this.processingStatus = { ...details };
    }
}

/** Preserve an authoritative step outcome; only genuinely unknown calls need review. */
export function processingFailure(error: unknown, fallbackStage: ProcessingStage = 'transcription', fallbackOutcome: ProviderOutcome = 'unknown'): ProcessingStatus {
    if (error instanceof ProcessingError) return { ...error.processingStatus };
    if (error instanceof ProcessingPausedError) return { stage: fallbackStage, state: 'blocked', code: error.code,
        retryAction: fallbackStage === 'transcription' ? 'retry_transcription' : 'resume_enrichment', providerOutcome: 'not_started' };
    if (error instanceof OperatingFundingUnavailableError) return { stage: fallbackStage, state: 'blocked',
        code: error.code, retryAction: 'contact_admin', providerOutcome: 'not_started' };
    if (error instanceof PrepaidFundingRequiredError) return { stage: fallbackStage, state: 'blocked', code: 'insufficient_prepaid_credit',
        retryAction: fallbackStage === 'transcription' ? 'retry_transcription' : 'resume_enrichment', providerOutcome: 'not_started' };
    if (error instanceof BillingSyncPendingError) return { stage: fallbackStage, state: 'blocked', code: error.code,
        retryAction: fallbackStage === 'transcription' ? 'retry_transcription' : 'resume_enrichment', providerOutcome: 'not_started' };
    const classification = classifyExternalServiceError(error);
    if (fallbackOutcome === 'responded' && (classification.errorKind === 'quota' || classification.errorKind === 'rate_limit')) {
        return { stage: fallbackStage, state: 'failed', code: 'provider_quota',
            retryAction: fallbackStage === 'transcription' ? 'retry_transcription' : 'resume_enrichment', providerOutcome: 'responded' };
    }
    if (fallbackOutcome !== 'unknown' && classification.errorKind === 'auth') return { stage: fallbackStage, state: 'blocked', code: 'provider_configuration', retryAction: 'contact_admin', providerOutcome: fallbackOutcome };
    const uncertain = fallbackOutcome === 'unknown';
    return { stage: fallbackStage, state: uncertain ? 'needs_review' : 'failed',
        code: uncertain ? 'provider_outcome_unknown' : fallbackOutcome === 'not_started' ? 'processing_not_started' : 'provider_rejected',
        retryAction: uncertain ? 'review_provider' : fallbackStage === 'transcription' ? 'retry_transcription' : 'resume_enrichment',
        providerOutcome: fallbackOutcome };
}

export function enrichmentNeedsResume(status?: ProcessingStatus): boolean {
    return Boolean(status && status.stage !== 'transcription' && status.stage !== 'completed'
        && status.state !== 'completed' && status.retryAction === 'resume_enrichment');
}

export const LEGACY_AI_BUDGET_REJECTION = 'The funded AI bundle is exhausted. The saved transcript and completed chunks are retained; review before retrying.';

/** Recognize only the old local pre-call budget rejection, never a provider error. */
export function legacyEnrichmentBlock(recording: {
    fullTranscript?: unknown[]; transcriptionEnrichmentPending?: boolean;
    transcriptionReceipt?: { readyAt?: Date; processingBudget?: unknown };
    transcriptionEnrichmentCosts?: { steps: Partial<Record<string, { state: string }>>; chunks?: Record<number, { state: string }> };
    aiWorkPlan?: unknown; aiWorkCheckpoints?: Record<string, { state: string }>;
    processingStatus?: ProcessingStatus;
}, error?: string): ProcessingStatus | undefined {
    if (error !== LEGACY_AI_BUDGET_REJECTION || !recording.transcriptionEnrichmentPending || !recording.fullTranscript?.length
        || !(recording.transcriptionReceipt?.readyAt instanceof Date) || !Number.isFinite(recording.transcriptionReceipt.readyAt.getTime())
        || recording.transcriptionReceipt.processingBudget || recording.processingStatus || recording.aiWorkPlan
        || Object.keys(recording.aiWorkCheckpoints || {}).length) return undefined;
    const checkpoints = [...Object.values(recording.transcriptionEnrichmentCosts?.steps || {}), ...Object.values(recording.transcriptionEnrichmentCosts?.chunks || {})];
    if (checkpoints.some(checkpoint => checkpoint?.state !== 'completed')) return undefined;
    return { stage: 'summary', state: 'blocked', code: 'legacy_ai_budget_exhausted', retryAction: 'resume_enrichment', providerOutcome: 'not_started' };
}
