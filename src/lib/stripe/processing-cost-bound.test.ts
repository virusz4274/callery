import test from 'node:test';
import assert from 'node:assert/strict';
import { assertExternalProcessingBound, processingAiCostBound, processingCostModels } from './processing-cost-bound';
import { testProcessingCostEvidence } from './processing-test-support';
import type { ProcessingTranscriptEnvelope } from './legacy-processing-budget';

const evidence = testProcessingCostEvidence();
const envelope = evidence.processingBounds!['gemini:gemini-3.5-transcribe'].envelope;
test('external processing proof requires every physical limit, operator verification and an explicit Gemini token ceiling', () => {
    assert.doesNotThrow(() => assertExternalProcessingBound(envelope, { provider: 'gemini', model: 'gemini-3.5-transcribe' }));
    for (const field of ['maxResponseBytes', 'maxSourceTextBytes', 'maxSegments', 'maxWords', 'maxSummaryLeaves', 'maxReduceLevels', 'maxTransliterationChunks', 'maxAsrOutputTokens'] as const) {
        const incomplete = structuredClone(envelope); delete (incomplete as Partial<ProcessingTranscriptEnvelope>)[field];
        assert.throws(() => assertExternalProcessingBound(incomplete, { provider: 'gemini', model: 'gemini-3.5-transcribe' }));
    }
    assert.throws(() => assertExternalProcessingBound({ ...envelope, externalBoundProof: { ...envelope.externalBoundProof!, verifiedBy: '' } }));
    assert.throws(() => assertExternalProcessingBound({ ...envelope, maxAsrOutputTokens: 65_537 }));
});
test('provider-enforced proof pins the model and the exact token setting transmitted upstream', () => {
    const bound: ProcessingTranscriptEnvelope = { ...envelope, externalBoundProof: { ...envelope.externalBoundProof!, kind: 'provider_enforced',
        enforcedConfiguration: { provider: 'gemini', model: 'gemini-3.5-transcribe', maxAsrOutputTokens: 8192 } } };
    assert.doesNotThrow(() => assertExternalProcessingBound(bound, { provider: 'gemini', model: 'gemini-3.5-transcribe' }));
    assert.throws(() => assertExternalProcessingBound(bound, { provider: 'gemini', model: 'unreviewed' }));
    assert.throws(() => assertExternalProcessingBound({ ...bound, maxAsrOutputTokens: 4096 }, { provider: 'gemini', model: 'gemini-3.5-transcribe' }));
    assert.throws(() => assertExternalProcessingBound(bound));
});
test('complete workflow cost includes all configured chunks and both attempts, rather than the obsolete per-minute bundle', () => {
    const models = processingCostModels(evidence), base = processingAiCostBound(envelope, models);
    const larger = processingAiCostBound({ ...envelope, maxTransliterationChunks: envelope.maxTransliterationChunks + 1 }, models);
    assert.ok(base > 0); assert.equal(larger - base, 2);
});
