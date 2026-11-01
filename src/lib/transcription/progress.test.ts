import test from 'node:test';
import assert from 'node:assert/strict';
import { processingProgress } from './progress';

test('ASR failure and saved-transcript enrichment failure remain distinct', () => {
    assert.deepEqual(processingProgress({ transcriptionStatus: 'failed', processingStatus: { stage: 'transcription', state: 'failed' } }),
        { transcriptAvailable: false, enrichmentState: 'not_started' });
    assert.deepEqual(processingProgress({ transcriptionStatus: 'failed', transcriptionEnrichmentPending: true,
        processingStatus: { stage: 'summary', state: 'blocked', retryAction: 'resume_enrichment' } }),
        { transcriptAvailable: true, enrichmentState: 'blocked' });
});

test('metadata projections expose saved transcript availability without copying personal transcript content', () => {
    assert.deepEqual(processingProgress({ transcriptionStatus: 'processing', processingStatus: { stage: 'embedding', state: 'running' } }),
        { transcriptAvailable: true, enrichmentState: 'running' });
    assert.deepEqual(processingProgress({ transcriptionStatus: 'completed' }), { transcriptAvailable: true, enrichmentState: 'completed' });
});


test('a retained older transcript does not turn a new ASR failure into an enrichment failure', () => {
    assert.deepEqual(processingProgress({ transcriptionStatus: 'failed', fullTranscript: [], processingStatus: { stage: 'transcription', state: 'failed' } }),
        { transcriptAvailable: true, enrichmentState: 'not_started' });
});
