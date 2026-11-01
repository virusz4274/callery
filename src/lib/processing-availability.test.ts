import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { MemoryBillingDatabase } from './stripe/test-support';
import { assertProcessingAvailable, processingAvailability, ProcessingPausedError } from './processing-availability';
import { processingFailure } from './transcription/processing-errors';

test('manual processing pause defaults off and changes no customer accounting', async () => {
    const memory = new MemoryBillingDatabase(), db = memory.asDb();
    assert.deepEqual(await processingAvailability(db), { ready: true });
    await assertProcessingAvailable(db);
    memory.collection('system_settings').values.push({ _id: new ObjectId(), processingPaused: true });
    assert.deepEqual(await processingAvailability(db), { ready: false, code: 'processing_paused' });
    await assert.rejects(assertProcessingAvailable(db), ProcessingPausedError);
    assert.equal(memory.collection('users').values.length, 0);
    assert.equal(memory.collection('billing_operator_budget').values.length, 0);
});

test('a local pause offers safe continuation without an uncertain provider outcome', () => {
    for (const stage of ['transcription', 'summary', 'transliteration', 'embedding'] as const) {
        const status = processingFailure(new ProcessingPausedError(), stage);
        assert.equal(status.code, 'processing_paused');
        assert.equal(status.state, 'blocked');
        assert.equal(status.providerOutcome, 'not_started');
        assert.equal(status.retryAction, stage === 'transcription' ? 'retry_transcription' : 'resume_enrichment');
    }
});
