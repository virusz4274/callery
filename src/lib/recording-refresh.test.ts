import assert from 'node:assert/strict';
import test from 'node:test';
import { recordingNeedsRefresh } from './recording-refresh';
import { ObjectId } from 'mongodb';
import { toRecordingResponse } from './db/converters';
import type { Recording } from './db/types';

test('queued and deferred enrichment keep refreshing without polling untouched recordings', () => {
    assert.equal(recordingNeedsRefresh({ transcriptionStatus: 'pending' }), false);
    assert.equal(recordingNeedsRefresh({ transcriptionStatus: 'pending', processingStatus: { stage: 'transcription', state: 'running', code: 'queued', providerOutcome: 'not_started' } }), true);
    assert.equal(recordingNeedsRefresh({ transcriptionStatus: 'pending', processingStatus: { stage: 'summary', state: 'blocked', code: 'enrichment_queued' } }), true);
    assert.equal(recordingNeedsRefresh({ transcriptionStatus: 'processing' }), true);
    assert.equal(recordingNeedsRefresh({ transcriptionStatus: 'completed', processingProgress: { transcriptAvailable: true, enrichmentState: 'completed' } }), false);
});

test('review and blocked provider results stop automatic refresh until explicit recovery', () => {
    for (const state of ['failed', 'blocked', 'needs_review'] as const) {
        assert.equal(recordingNeedsRefresh({ transcriptionStatus: 'processing', processingStatus: { stage: 'embedding', state } }), false);
    }
});

test('queued retry projects live queue state without erasing saved failure evidence or exposing its journal ID', () => {
    const now = new Date();
    const recording = { _id: new ObjectId(), contactId: null, recordedAt: now, createdAt: now, updatedAt: now,
        transcriptionStatus: 'failed', transcriptionQueuedJobId: 'private-job',
        processingStatus: { stage: 'transcription', state: 'needs_review', providerOutcome: 'unknown' },
    } as Recording;
    const response = toRecordingResponse(recording);
    assert.equal(response.processingStatus?.code, 'queued');
    assert.equal(recordingNeedsRefresh(response), true);
    assert.equal('transcriptionQueuedJobId' in response, false);
    assert.equal(recording.processingStatus?.state, 'needs_review');
    delete recording.transcriptionQueuedJobId;
    assert.equal(recordingNeedsRefresh(toRecordingResponse(recording)), false);
});
