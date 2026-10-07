import { z } from 'zod';

const multiplier = z.number().finite().positive('Enter a number greater than zero.');

export const TranscriptionMultipliersSchema = z.object({
    soniox: multiplier,
    elevenlabs: multiplier,
    gemini: multiplier,
    openai_compat: multiplier,
});

export type TranscriptionMultipliers = z.infer<typeof TranscriptionMultipliersSchema>;

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
