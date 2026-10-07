import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTranscriptionMultipliers, TranscriptionMultipliersSchema } from './transcription-multipliers';

const configured = { soniox: 2, elevenlabs: 4, gemini: 0.25, openai_compat: 0.05 };

test('admin multiplier defaults respect configuration and preserve stored overrides', () => {
    assert.deepEqual(resolveTranscriptionMultipliers(configured), configured);
    assert.deepEqual(resolveTranscriptionMultipliers(configured, { soniox: 3, gemini: 0.75 }), {
        ...configured, soniox: 3, gemini: 0.75,
    });
    assert.deepEqual(resolveTranscriptionMultipliers(configured, { gemini: undefined }), configured);
});

test('multiplier forms accept fractions and server patches validate every supplied provider', () => {
    assert.deepEqual(TranscriptionMultipliersSchema.parse(configured), configured);
    assert.deepEqual(TranscriptionMultipliersSchema.partial().parse({ gemini: 0.001 }), { gemini: 0.001 });
    for (const provider of Object.keys(configured)) {
        for (const value of [0, -1, NaN, Infinity, -Infinity, '0.25', null]) {
            assert.equal(TranscriptionMultipliersSchema.partial().safeParse({ [provider]: value }).success, false, `${provider}: ${value}`);
        }
    }
    assert.equal(TranscriptionMultipliersSchema.safeParse({ ...configured, gemini: Number('') }).success, false);
});
