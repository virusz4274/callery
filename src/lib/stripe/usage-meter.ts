import { validateUsageTariff, type UsageTariffSnapshot } from './usage-tariff';
import type { UsagePricingTier } from './catalog';

export type UsageKind = 'storage' | 'transcription';
export interface AcceptedUsageMeter {
    type: UsageKind;
    tariff?: UsageTariffSnapshot;
    catalogVersion?: string;
    meterPriceId?: string;
    usageTier?: UsagePricingTier;
    eventName?: string;
    unitAmountMicros?: number;
}

/** Delivery always uses the rate and identity accepted with the work. */
export function usageMeterContract(event: AcceptedUsageMeter) {
    if (!event.tariff) throw new Error('Usage has no verified immutable tariff snapshot.');
    const tariff = validateUsageTariff(event.tariff);
    if (tariff.kind !== event.type
        || (event.meterPriceId && event.meterPriceId !== tariff.priceId)
        || (event.usageTier && event.usageTier !== tariff.usageTier)
        || (event.eventName && event.eventName !== tariff.eventName)
        || (event.catalogVersion && event.catalogVersion !== tariff.catalogVersion)) throw new Error('Accepted meter identity or price changed.');
    return { ...tariff, type: event.type };
}
