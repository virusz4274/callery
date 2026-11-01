import 'server-only';
import { BILLING_CATALOG, type UsagePricingTier } from './catalog';
import { formatUsdAtoms, quoteUsageQuantity, validateUsageTariff, type UsageTariffPair } from './usage-tariff';

export interface UsagePricePresentation {
    tier: UsagePricingTier;
    ready: boolean;
    currency: 'usd';
    /** @deprecated Historical clients may retain this field; new responses omit profitability policy. */
    minimumMarginBps?: number;
    minimumRecordingUsd: string;
    catalogVersion?: string;
    transcription?: { quantityUnit: 'weighted_15s_block'; unitAmountDecimal: string; usdPerUnit: string };
    storage?: { quantityUnit: 'milliGiB'; unitAmountDecimal: string; usdPerUnit: string };
    storageUsdPerGiB?: string;
    providers: { id: string; name: string; multiplier: number; usdPerMinute: string }[];
}

/** Display only the reviewed customer tariff; costs and credentials never enter public responses. */
export function usagePricePresentation(tier: UsagePricingTier, tariffs?: UsageTariffPair): UsagePricePresentation {
    const result: UsagePricePresentation = { tier, ready: false, currency: 'usd',
        minimumRecordingUsd: '0', providers: [] };
    if (!tariffs) return result;
    try {
        const audio = validateUsageTariff(tariffs.transcription), storage = validateUsageTariff(tariffs.storage);
        if (audio.kind !== 'transcription' || storage.kind !== 'storage' || audio.usageTier !== tier || storage.usageTier !== tier
            || audio.catalogVersion !== storage.catalogVersion) return result;
        result.providers = Object.entries(BILLING_CATALOG.providers).map(([id, provider]) => ({ id,
            name: id === 'soniox' ? 'Soniox' : id === 'gemini' ? 'Gemini' : 'ElevenLabs', multiplier: provider.multiplier,
            usdPerMinute: formatUsdAtoms(quoteUsageQuantity(audio, 4 * provider.multiplier).exactAtoms) }));
        result.storageUsdPerGiB = formatUsdAtoms(quoteUsageQuantity(storage, 1000).exactAtoms);
        result.minimumRecordingUsd = formatUsdAtoms(quoteUsageQuantity(audio, audio.minimumQuantity).exactAtoms);
        result.transcription = { quantityUnit: 'weighted_15s_block', unitAmountDecimal: audio.unitAmountDecimal, usdPerUnit: formatUsdAtoms(audio.unitPriceAtoms) };
        result.storage = { quantityUnit: 'milliGiB', unitAmountDecimal: storage.unitAmountDecimal, usdPerUnit: formatUsdAtoms(storage.unitPriceAtoms) };
        result.catalogVersion = audio.catalogVersion; result.ready = true;
    } catch { result.providers = []; }
    return result;
}
