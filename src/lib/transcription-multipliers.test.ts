import test from 'node:test';
import assert from 'node:assert/strict';
import { assertEditableTranscriptionMultipliers, effectiveTranscriptionProvider, resolveEffectiveTranscriptionPolicy, resolveTranscriptionMultipliers, TranscriptionMultipliersSchema } from './transcription-multipliers';

const configured = { soniox: 2, elevenlabs: 4, gemini: 0.25, openai_compat: 0.05 };

test('admin multiplier defaults respect configuration and preserve stored overrides', () => {
    assert.deepEqual(resolveTranscriptionMultipliers(configured), configured);
    assert.deepEqual(resolveTranscriptionMultipliers(configured, { soniox: 3, gemini: 0.75 }), {
        ...configured, soniox: 3, gemini: 0.75,
    });
    assert.deepEqual(resolveTranscriptionMultipliers(configured, { gemini: undefined }), configured);
});

test('managed policy uses approved 1×/3×/5× weights regardless of saved installation overrides', () => {
    const overrides = { soniox: 0.01, gemini: 0.02, elevenlabs: 0.03, openai_compat: 9 };
    const before = structuredClone(overrides);
    const policy = resolveEffectiveTranscriptionPolicy(true, { gemini: 0.25 }, overrides);
    assert.deepEqual(policy, { mode: 'managed', multipliers: { soniox: 1, gemini: 3, elevenlabs: 5 } });
    assert.deepEqual(overrides, before, 'effective settings must never rewrite saved self-host values');
    assert.deepEqual(effectiveTranscriptionProvider(policy, 'gemini', 'models/gemini-3.5-transcribe'), { multiplier: 3, model: 'gemini-3.5-transcribe' });
    for (const provider of ['openai_compat', 'unsupported', 'constructor', '__proto__']) {
        assert.throws(() => effectiveTranscriptionProvider(policy, provider), /not available/);
    }
    assert.throws(() => effectiveTranscriptionProvider(policy, 'gemini', 'unpriced-model'), /not in the priced managed catalog/);
});

test('self-host policy preserves environment defaults, partial stored overrides and custom models', () => {
    const policy = resolveEffectiveTranscriptionPolicy(false, configured, { gemini: 0.75 });
    assert.deepEqual(policy, { mode: 'self-hosted', multipliers: { ...configured, gemini: 0.75 } });
    assert.deepEqual(effectiveTranscriptionProvider(policy, 'gemini', 'custom-model'), { multiplier: 0.75, model: 'custom-model' });
    assert.deepEqual(effectiveTranscriptionProvider(policy, 'openai_compat', 'whisper'), { multiplier: 0.05, model: 'whisper' });
});

test('managed settings reject all multiplier patches while unrelated settings and self-host edits remain allowed', () => {
    assert.doesNotThrow(() => assertEditableTranscriptionMultipliers(true, undefined));
    for (const patch of [{}, { soniox: 1 }, { gemini: 0.1 }, null]) {
        assert.throws(() => assertEditableTranscriptionMultipliers(true, patch), /fixed by the approved billing policy/);
    }
    assert.doesNotThrow(() => assertEditableTranscriptionMultipliers(false, { gemini: 0.1 }));
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
