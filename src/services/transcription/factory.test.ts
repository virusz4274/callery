import assert from 'node:assert/strict';
import test from 'node:test';
import { TranscriptionFactory, type TranscriptionProviderId } from './factory';

function restoreEnvironment(previous: Record<string, string | undefined>) {
    for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
}

test('managed factory listing ignores self-host pricing and filters providers before availability checks', t => {
    const previous = { NEXT_PUBLIC_ENABLE_BILLING: process.env.NEXT_PUBLIC_ENABLE_BILLING, TRANSCRIPTION_PRICING_JSON: process.env.TRANSCRIPTION_PRICING_JSON };
    t.after(() => restoreEnvironment(previous));
    process.env.NEXT_PUBLIC_ENABLE_BILLING = 'true';
    process.env.TRANSCRIPTION_PRICING_JSON = 'legacy-invalid-json';
    const checked: string[] = [];
    class ConfiguredFactory extends TranscriptionFactory {
        static isProviderAvailable(id: TranscriptionProviderId): boolean {
            checked.push(id);
            if (id === 'openai_compat') throw new Error('Managed mode must not inspect the unapproved compatible server.');
            return true;
        }
    }
    assert.deepEqual(Object.fromEntries(ConfiguredFactory.getAvailableProviders().map(provider => [provider.id, provider.defaultMultiplier])), { soniox: 1, elevenlabs: 5, gemini: 3 });
    assert.deepEqual(checked, ['soniox', 'elevenlabs', 'gemini']);
});

test('self-host factory preserves configured weights and compatible provider availability', t => {
    const previous = { NEXT_PUBLIC_ENABLE_BILLING: process.env.NEXT_PUBLIC_ENABLE_BILLING, TRANSCRIPTION_PRICING_JSON: process.env.TRANSCRIPTION_PRICING_JSON };
    t.after(() => restoreEnvironment(previous));
    process.env.NEXT_PUBLIC_ENABLE_BILLING = 'false';
    process.env.TRANSCRIPTION_PRICING_JSON = JSON.stringify({ soniox: 2, elevenlabs: 4, gemini: 0.25, openai_compat: 0.05 });
    class ConfiguredFactory extends TranscriptionFactory {
        static isProviderAvailable(): boolean { return true; }
    }
    assert.deepEqual(Object.fromEntries(ConfiguredFactory.getAvailableProviders().map(provider => [provider.id, provider.defaultMultiplier])), { soniox: 2, elevenlabs: 4, gemini: 0.25, openai_compat: 0.05 });
});
