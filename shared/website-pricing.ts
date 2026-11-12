import { z } from 'zod';

const amount = z.number().nonnegative();
const decimal = z.string().max(48).regex(/^(0|[1-9]\d*)(\.\d+)?$/)
    .refine(value => Number.isFinite(Number(value)));
const origin = z.url().refine(value => {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
        && url.pathname === '/' && !url.search && !url.hash;
}, 'Expected an HTTP(S) origin');
const currency = z.string().regex(/^[A-Z]{3}$/);
const text = z.string().trim().min(1).max(1000);

export const websitePricingSchema = z.strictObject({
    version: z.literal(1),
    sourceAppOrigin: origin,
    generatedAt: z.iso.datetime(),
    pricing: z.strictObject({
        trial: z.strictObject({
            key: z.literal('free-trial'), name: text, description: text,
            price: z.literal(0), currency, durationDays: z.number().int().positive(),
            storageBytes: amount, weightedMinutes: amount,
        }).nullable(),
        plans: z.array(z.strictObject({
            key: z.enum(['standard', 'pro', 'lifetime']), name: text, description: text,
            price: z.number().positive(), currency,
            interval: z.enum(['monthly', 'yearly', 'lifetime']),
            storageBytes: amount.nullable(), weightedMinutes: amount.nullable(),
            available: z.boolean(),
            usage: z.strictObject({
                providers: z.array(z.strictObject({
                    id: z.enum(['soniox', 'gemini', 'elevenlabs']), name: text,
                    multiplier: z.number().positive(), usdPerMinute: decimal,
                })).min(1),
                storageUsdPerGiB: decimal, minimumRecordingUsd: decimal,
            }).nullable(),
        }).refine(plan => (plan.key === 'lifetime') === (plan.interval === 'lifetime'),
            'Plan key and payment interval disagree')).min(1).max(3)
            .refine(plans => new Set(plans.map(plan => plan.key)).size === plans.length, 'Duplicate plan keys'),
    }),
});

export type WebsitePricingSnapshot = z.infer<typeof websitePricingSchema>;
