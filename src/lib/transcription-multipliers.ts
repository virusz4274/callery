import { z } from 'zod';
import { BILLING_CATALOG, managedProvider } from '@/lib/stripe/catalog';

const multiplier = z.number().finite().positive('Enter a number greater than zero.');

export const TranscriptionMultipliersSchema = z.object({
    soniox: multiplier,
    elevenlabs: multiplier,
    gemini: multiplier,
    openai_compat: multiplier,
});

export type TranscriptionMultipliers = z.infer<typeof TranscriptionMultipliersSchema>;
export type TranscriptionPolicyMode = 'managed' | 'self-hosted';
export interface EffectiveTranscriptionPolicy {
    mode: TranscriptionPolicyMode;
    multipliers: Partial<TranscriptionMultipliers>;
}

/** Show the same stored-override/configured-default values used by transcription billing. */
export function resolveTranscriptionMultipliers(
    defaults: Record<string, number>,
    overrides?: Partial<TranscriptionMultipliers>,
): TranscriptionMultipliers {
    const values = { ...defaults };
    for (const [provider, value] of Object.entries(overrides ?? {})) {
        if (value !== undefined) values[provider] = value;
    }
    return TranscriptionMultipliersSchema.parse(values);
}

/** Managed billing never reads installation overrides as priced provider policy. */
export function resolveEffectiveTranscriptionPolicy(
    managed: boolean,
    defaults: Record<string, number>,
    overrides?: Partial<TranscriptionMultipliers>,
): EffectiveTranscriptionPolicy {
    if (managed) return {
        mode: 'managed',
        multipliers: Object.fromEntries(Object.entries(BILLING_CATALOG.providers).map(([id, provider]) => [id, provider.multiplier])),
    };
    return { mode: 'self-hosted', multipliers: resolveTranscriptionMultipliers(defaults, overrides) };
}

/** Resolve selection, display and quota admission through the same effective policy. */
export function effectiveTranscriptionProvider(
    policy: EffectiveTranscriptionPolicy,
    provider: string,
    model?: string,
): { multiplier: number; model?: string } {
    if (policy.mode === 'managed') {
        if (!Object.hasOwn(BILLING_CATALOG.providers, provider)) throw new Error('This transcription provider is not available in the managed catalog.');
        const entry = managedProvider(provider, model);
        return { multiplier: entry.multiplier, model: entry.model };
    }
    const multiplier = policy.multipliers[provider as keyof TranscriptionMultipliers];
    if (multiplier === undefined) throw new Error('This transcription provider is not available.');
    return { multiplier, ...(model ? { model } : {}) };
}

export function assertEditableTranscriptionMultipliers(managed: boolean, overrides: unknown): void {
    if (managed && overrides !== undefined) throw new Error('Managed transcription weights are fixed by the approved billing policy.');
}
