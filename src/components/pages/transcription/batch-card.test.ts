import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { BatchResponse } from '@/lib/transcription/batch-types';
import type { ProcessingStatus } from '@/lib/transcription/processing-errors';
import { TranscriptionBatchCard } from './batch-card';

function render(status: ProcessingStatus) {
    const batch: BatchResponse = { id: 'owned-batch', name: 'Saved transcript', dateKey: null, recordingIds: ['owned-recording'],
        provider: 'gemini', status: 'needs_review', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        totalDuration: 60, completedCount: 0, failedCount: 1,
        recordings: [{ id: 'owned-recording', fileName: 'Fictional demo', displayName: 'Demo', duration: 60,
            recordedAt: new Date().toISOString(), dateKey: null, importId: 'owned-import', status: 'failed', jobState: 'needs_review', processingStatus: status }] };
    return renderToStaticMarkup(createElement(TranscriptionBatchCard, { batch, providerName: 'Gemini', isPending: false,
        onEdit() {}, async onAction() {} }));
}

test('a known blocked enrichment stage offers resume without suggesting another audio charge', () => {
    const markup = render({ stage: 'summary', state: 'blocked', retryAction: 'resume_enrichment', providerOutcome: 'not_started' });
    assert.match(markup, /Resume enrichment/);
    assert.match(markup, /audio is not transcribed or charged again/);
    assert.doesNotMatch(markup, /I checked the provider outcome/);
});

test('unknown calls require acknowledgement while administrative holds cannot be waived', () => {
    const unknown = render({ stage: 'transliteration', state: 'needs_review', retryAction: 'review_provider', providerOutcome: 'unknown' });
    assert.match(unknown, /I checked the provider outcome/);
    const held = render({ stage: 'summary', state: 'needs_review', retryAction: 'contact_admin', providerOutcome: 'responded' });
    assert.match(held, /Contact your administrator/);
    assert.doesNotMatch(held, /I checked the provider outcome/);
    assert.match(held, /disabled/);
});

test('an operator cash block directs customers to support without suggesting credit purchases or provider charges', () => {
    const markup = render({ stage: 'summary', state: 'blocked', code: 'operating_funds_unavailable', retryAction: 'contact_admin', providerOutcome: 'not_started' });
    assert.match(markup, /Contact support to restore processing/);
    assert.match(markup, /saved files are retained/);
    assert.doesNotMatch(markup, /I checked the provider outcome|[Tt]op.up|[Aa]dd credit/);
    assert.match(markup, /disabled/);
});

test('manual pause, provider quota and customer credit show different remedies', () => {
    for (const [code, remedy] of [['processing_paused', /operator has paused/], ['provider_quota', /provider reached a quota/], ['insufficient_prepaid_credit', /Add prepaid usage credit/]] as const) {
        const markup = render({ stage: 'transcription', state: 'blocked', code, retryAction: 'retry_transcription', providerOutcome: 'not_started' });
        assert.match(markup, remedy);
        assert.doesNotMatch(markup, /I checked the provider outcome/);
    }
});
