import type Stripe from 'stripe';
import type { Plan } from '@/lib/db/types';
import type { StripeMetering } from './billing-types';
import { getUsageMeterDefinitions, type UsagePricingTier } from './catalog';
import { createUsageTariffSnapshot, parseUnitPriceAtoms, type UsageTariffPair, type UsageTariffSnapshot } from './usage-tariff';

export class BillingConfigurationError extends Error {}

export function validateMeterPriceUnits(price: Stripe.Price, allocation = 0, expected?: 'storage' | 'transcription', tier: UsagePricingTier = 'recurring', tariff?: UsageTariffSnapshot): void {
    void allocation;
    if (price.transform_quantity) throw new BillingConfigurationError('Meter prices must use integer milliGiB or weighted 15-second blocks without quantity transforms.');
    void expected; void tier;
    if (price.billing_scheme !== 'per_unit' || price.unit_amount_decimal == null && price.unit_amount == null
        || (tariff && parseUnitPriceAtoms(price.unit_amount_decimal ?? price.unit_amount) !== tariff.unitPriceAtoms)) {
        throw new BillingConfigurationError('Managed v2 usage prices must be exact positive per-unit prices without included tiers.');
    }
    parseUnitPriceAtoms(price.unit_amount_decimal ?? price.unit_amount);
}

export async function validateMeterPrices(stripe: Stripe, ids: { storage: string; transcription: string }, currency?: string, allocations = { storage: 0, transcription: 0 }, tier: UsagePricingTier = 'recurring', tariffs?: UsageTariffPair, allowInactive = false) {
    if (!ids.storage || !ids.transcription || ids.storage === ids.transcription) {
        throw new BillingConfigurationError('Storage and transcription meter prices must both be configured.');
    }
    const prices = await Promise.all([ids.storage, ids.transcription].map(id => stripe.prices.retrieve(id, { expand: ['tiers'] })));
    for (const [index, price] of prices.entries()) {
        if ((!allowInactive && !price.active) || price.type !== 'recurring' || price.recurring?.usage_type !== 'metered' || !price.recurring.meter
            || (currency && price.currency !== currency)) throw new BillingConfigurationError('Invalid metered Stripe price configuration.');
        validateMeterPriceUnits(price, index === 0 ? allocations.storage : allocations.transcription, index === 0 ? 'storage' : 'transcription', tier, tariffs?.[index === 0 ? 'storage' : 'transcription']);
        if (price.recurring.interval !== 'month' || price.recurring.interval_count !== 1) throw new BillingConfigurationError('Usage meters must renew monthly independently of the base plan.');
        if (index && (price.recurring.interval !== prices[0].recurring?.interval
            || price.recurring.interval_count !== prices[0].recurring?.interval_count)) {
            throw new BillingConfigurationError('Storage and transcription meter prices must share a billing interval.');
        }
        const meter = await stripe.billing.meters.retrieve(price.recurring.meter);
        const storage = index === 0;
        if ((!allowInactive && meter.status !== 'active') || meter.event_name !== (tariffs?.[storage ? 'storage' : 'transcription'].eventName || getUsageMeterDefinitions(tier)[storage ? 'storage' : 'transcription'].eventName)
            || meter.event_time_window != null
            || meter.default_aggregation.formula !== (storage ? 'last' : 'sum')
            || meter.customer_mapping.event_payload_key !== 'stripe_customer_id'
            || meter.value_settings.event_payload_key !== 'value') {
            throw new BillingConfigurationError('Stripe meter name, aggregation or payload configuration does not match the app.');
        }
    }
    return prices;
}

export async function validateCheckoutPlan(stripe: Stripe, plan: Plan) {
    if (plan.interval === 'trial' || plan.key === 'free-trial') throw new BillingConfigurationError('The one-time free trial cannot be purchased or renewed through Stripe.');
    const price = await stripe.prices.retrieve(plan.stripePriceId);
    if (!price.active || (plan.interval === 'lifetime' ? price.type !== 'one_time' : price.type !== 'recurring')
        || (price.type === 'recurring' && price.recurring?.usage_type === 'metered')) {
        throw new BillingConfigurationError('The plan base price is invalid or unavailable.');
    }
    const meters = await validateMeterPrices(stripe, { storage: plan.stripeStoragePriceId || '', transcription: plan.stripeTranscriptionPriceId || '' }, price.currency, plan.limits, plan.interval === 'lifetime' ? 'lifetime' : 'recurring', plan.usageTariffs);
    void meters; // Monthly meter periods remain independent of monthly/yearly licensed base items.
    return price;
}

/** Require precisely the two approved meter items; extra meters could double charge. */
export function verifiedSubscriptionMeters(subscription: Stripe.Subscription, ids: { storage: string; transcription: string }): StripeMetering | undefined {
    const meterIds = subscription.items.data.filter(item => item.price.recurring?.usage_type === 'metered').map(item => item.price.id);
    if (meterIds.length !== 2 || ids.storage === ids.transcription || !meterIds.includes(ids.storage) || !meterIds.includes(ids.transcription)) return;
    return { subscriptionId: subscription.id, storagePriceId: ids.storage, transcriptionPriceId: ids.transcription, verifiedAt: new Date() };
}

/** Import financial amounts from Stripe; the application owns only unit and aggregation protocols. */
export async function readUsageTariffs(stripe: Stripe, ids: { storage: string; transcription: string }, catalogVersion: string, tier: UsagePricingTier): Promise<UsageTariffPair> {
    const prices = await validateMeterPrices(stripe, ids, 'usd', undefined, tier);
    const rows = await Promise.all(prices.map(async (price, index) => {
        const kind = index === 0 ? 'storage' as const : 'transcription' as const;
        const meter = await stripe.billing.meters.retrieve(price.recurring!.meter!);
        return createUsageTariffSnapshot({ catalogVersion, usageTier: tier, kind, priceId: price.id, meterId: meter.id || price.recurring!.meter!,
            eventName: meter.event_name, currency: 'usd', quantityUnit: kind === 'storage' ? 'milliGiB' : 'weighted_15s_block',
            aggregation: kind === 'storage' ? 'last' : 'sum', unitAmountDecimal: String(price.unit_amount_decimal ?? price.unit_amount),
            minimumChargeMicros: kind === 'transcription' && tier === 'recurring' ? 10_000 : 0 });
    }));
    return { storage: rows[0], transcription: rows[1] };
}
