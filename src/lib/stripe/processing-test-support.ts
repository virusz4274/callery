import { BILLING_CATALOG } from './catalog';
import type { ManagedCostPolicy } from './economics';

/** Synthetic arithmetic fixtures only. Never measured evidence or deployment configuration. */
export function testProcessingCostEvidence(externalAsrCostBoundMicros = 100): Pick<ManagedCostPolicy, 'ai' | 'processingBounds'> {
    return { ai: { 'gemini:test': { inputUsdMicrosPerMillionTokens: 1, outputUsdMicrosPerMillionTokens: 1 } },
        processingBounds: Object.fromEntries(Object.entries(BILLING_CATALOG.providers).map(([provider, entry]) => [`${provider}:${entry.model}`, { envelope: {
            maxResponseBytes: 4096, maxSourceTextBytes: 1024, maxSegments: 64, maxWords: 256, maxSummaryLeaves: 2, maxReduceLevels: 2, maxTransliterationChunks: 4,
            ...(provider === 'gemini' ? { maxAsrOutputTokens: 8192 } : {}), externalAsrCostBoundMicros,
            externalBoundProof: { kind: 'provider_contract' as const, reference: 'SYNTHETIC-TEST-ONLY-NOT-LIVE-EVIDENCE', expiresAt: '2099-01-01',
                verifiedAt: '2026-01-01', verifiedBy: 'UNIT-TEST-NOT-AN-OPERATOR-AUDIT' },
        } }])) };
}
