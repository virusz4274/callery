import test from 'node:test';
import assert from 'node:assert/strict';
import { LEGACY_AI_BUDGET_REJECTION, ProcessingError, enrichmentNeedsResume, legacyEnrichmentBlock, processingFailure } from './processing-errors';
import { BillingSyncPendingError, OperatingFundingUnavailableError, PrepaidFundingRequiredError } from '@/lib/stripe/billing-errors';

test('operator cash shortages are local support blocks, distinct from customer credit and unknown provider outcomes', () => {
    for (const stage of ['transcription', 'summary', 'transliteration', 'embedding'] as const) {
        const status = processingFailure(new OperatingFundingUnavailableError('No retained funds.'), stage);
        assert.deepEqual(status, { stage, state: 'blocked', code: 'operating_funds_unavailable', retryAction: 'contact_admin', providerOutcome: 'not_started' });
        assert.equal(enrichmentNeedsResume(status), false);
    }
    assert.equal(new OperatingFundingUnavailableError('Operator funds') instanceof PrepaidFundingRequiredError, false);
});

test('known pre-call funding or configuration blocks preserve the affected enrichment stage', () => {
    const error = new ProcessingError('The saved bundle cannot fund this call.', {
        stage: 'transliteration', state: 'blocked', code: 'processing_budget',
        retryAction: 'resume_enrichment', providerOutcome: 'not_started',
    });
    assert.deepEqual(processingFailure(error), error.processingStatus);
    assert.equal(enrichmentNeedsResume(processingFailure(error)), true);
});

test('legacy continuation requires a successful audio receipt and no uncertain paid AI checkpoint', () => {
    const saved = { fullTranscript: [{}], transcriptionEnrichmentPending: true, transcriptionReceipt: { readyAt: new Date() } };
    assert.equal(legacyEnrichmentBlock(saved, LEGACY_AI_BUDGET_REJECTION)?.retryAction, 'resume_enrichment');
    for (const changed of [
        { ...saved, transcriptionReceipt: undefined },
        { ...saved, aiWorkCheckpoints: { call: { state: 'unknown' } } },
        { ...saved, transcriptionEnrichmentCosts: { steps: { summary: { state: 'in_flight' } } } },
        { ...saved, transcriptionEnrichmentCosts: { steps: { summary: { state: 'failed' } } } },
        { ...saved, processingStatus: { stage: 'summary', state: 'needs_review', providerOutcome: 'unknown' } as const },
    ]) assert.equal(legacyEnrichmentBlock(changed, LEGACY_AI_BUDGET_REJECTION), undefined);
    assert.equal(legacyEnrichmentBlock(saved, 'Transcript saved. AI enrichment failed; review before retrying.'), undefined);
});

test('unknown provider outcomes require review while known rejections remain retryable', () => {
    const unknown = processingFailure(new Error('Connection lost'), 'summary', 'unknown');
    assert.equal(unknown.state, 'needs_review');
    assert.equal(unknown.retryAction, 'review_provider');
    assert.equal(enrichmentNeedsResume(unknown), false);
    const rejected = processingFailure(new Error('Rejected'), 'summary', 'responded');
    assert.equal(rejected.state, 'failed');
    assert.equal(enrichmentNeedsResume(rejected), true);
    assert.equal(enrichmentNeedsResume({ stage: 'completed', state: 'completed', retryAction: 'none' }), false);
});

test('customer prepaid shortages are safe local billing blocks', () => {
    const status = processingFailure(new PrepaidFundingRequiredError('Add usage credit.'), 'transcription');
    assert.equal(status.code, 'insufficient_prepaid_credit');
    assert.equal(status.providerOutcome, 'not_started');
    assert.equal(status.retryAction, 'retry_transcription');
});

test('billing synchronization and provider quota have distinct safe retry states', () => {
    assert.equal(processingFailure(new BillingSyncPendingError(), 'summary').code, 'billing_sync_pending');
    const quota = processingFailure(Object.assign(new Error('Rate limit'), { status: 429 }), 'transcription', 'responded');
    assert.equal(quota.code, 'provider_quota');
    assert.equal(quota.providerOutcome, 'responded');
    assert.equal(processingFailure(Object.assign(new Error('Invalid API key'), { status: 401 }), 'summary', 'responded').code, 'provider_configuration');
});
