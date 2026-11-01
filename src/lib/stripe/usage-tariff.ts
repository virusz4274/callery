import { createHash } from 'node:crypto';
import type { UsagePricingTier } from './catalog';

/** Stripe prices have at most 12 decimal places in cents. These atoms never leave rate/amount buckets. */
export const ATOMS_PER_MICRO = BigInt('100000000');
export const ATOMS_PER_CENT = BigInt('1000000000000');
export interface UsageTariffSnapshot {
    id: string; catalogVersion: string; usageTier: UsagePricingTier; kind: 'storage' | 'transcription';
    priceId: string; meterId: string; eventName: string; currency: 'usd';
    quantityUnit: 'weighted_15s_block' | 'milliGiB'; aggregation: 'sum' | 'last';
    unitAmountDecimal: string; unitPriceAtoms: string; minimumChargeMicros: number; minimumQuantity: number;
}
export interface UsageTariffPair { storage: UsageTariffSnapshot; transcription: UsageTariffSnapshot }
export interface UsageAmountAccumulator {
    tariff: UsageTariffSnapshot; quantity: number; settledExactAtoms: string; grossEarnedMicros: number;
    invoicedExactAtoms: string; invoicedGrossMicros: number; roundingReservedMicros: number;
}
function safe(value: bigint, name = 'Usage amount'): number {
    if (value < BigInt(0) || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${name} exceeds the supported range.`);
    return Number(value);
}
export function nonnegativeAtoms(value: string): bigint {
    if (!/^(0|[1-9]\d*)$/.test(value)) throw new Error('Invalid exact usage amount.');
    return BigInt(value);
}
export function ceilAtoms(value: bigint, divisor: bigint): bigint {
    if (value < BigInt(0) || divisor <= BigInt(0)) throw new Error('Invalid exact usage division.');
    return (value + divisor - BigInt(1)) / divisor;
}
/** Expand decimal strings without Number, including Decimal SDK scientific notation. */
export function canonicalUnitAmountDecimal(value: unknown): string {
    const input = String(value), match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(input);
    if (!match) throw new Error('Usage prices require a positive decimal amount in USD cents.');
    const exponent = match[3] ? Number(match[3]) : 0;
    if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 100) throw new Error('Usage price exponent exceeds the supported range.');
    const digits = match[1] + (match[2] || ''), point = match[1].length + exponent;
    const whole = (point <= 0 ? '0' : digits.slice(0, point).padEnd(point, '0')).replace(/^0+(?=\d)/, '');
    const fraction = (point < 0 ? '0'.repeat(-point) + digits : digits.slice(Math.max(0, point))).replace(/0+$/, '');
    if (fraction.length > 12) throw new Error('Usage prices support at most 12 decimal places in USD cents.');
    const result = `${whole || '0'}${fraction ? `.${fraction}` : ''}`;
    if (/^0(?:\.0*)?$/.test(result)) throw new Error('Usage meter prices must be positive.');
    return result;
}
export function parseUnitPriceAtoms(value: unknown): string {
    const [whole, fraction = ''] = canonicalUnitAmountDecimal(value).split('.');
    return (BigInt(whole) * ATOMS_PER_CENT + BigInt(fraction.padEnd(12, '0'))).toString();
}
export function createUsageTariffSnapshot(input: Omit<UsageTariffSnapshot, 'id' | 'unitPriceAtoms' | 'minimumQuantity'> & { id?: string }): UsageTariffSnapshot {
    const unitAmountDecimal = canonicalUnitAmountDecimal(input.unitAmountDecimal), unitPriceAtoms = parseUnitPriceAtoms(unitAmountDecimal);
    if (!Number.isSafeInteger(input.minimumChargeMicros) || input.minimumChargeMicros < 0) throw new Error('Invalid recording minimum.');
    const minimumQuantity = safe(ceilAtoms(BigInt(input.minimumChargeMicros) * ATOMS_PER_MICRO, BigInt(unitPriceAtoms)), 'Recording minimum');
    const data = { catalogVersion: input.catalogVersion, usageTier: input.usageTier, kind: input.kind, priceId: input.priceId,
        meterId: input.meterId, eventName: input.eventName, currency: input.currency, quantityUnit: input.quantityUnit, aggregation: input.aggregation,
        unitAmountDecimal, unitPriceAtoms, minimumChargeMicros: input.minimumChargeMicros, minimumQuantity };
    const snapshot = { ...data, id: input.id || createHash('sha256').update(JSON.stringify(data)).digest('hex') };
    assertUsageTariff(snapshot);
    return snapshot;
}
export function assertUsageTariff(tariff: UsageTariffSnapshot): UsageTariffSnapshot {
    if (!tariff.id || !tariff.catalogVersion || !tariff.priceId || !tariff.meterId || !tariff.eventName || tariff.currency !== 'usd'
        || !['recurring', 'lifetime'].includes(tariff.usageTier)
        || (tariff.kind === 'storage' ? tariff.quantityUnit !== 'milliGiB' || tariff.aggregation !== 'last' || tariff.minimumChargeMicros !== 0
            : tariff.kind !== 'transcription' || tariff.quantityUnit !== 'weighted_15s_block' || tariff.aggregation !== 'sum')
        || !Number.isSafeInteger(tariff.minimumChargeMicros) || tariff.minimumChargeMicros < 0
        || parseUnitPriceAtoms(tariff.unitAmountDecimal) !== tariff.unitPriceAtoms || !Number.isSafeInteger(tariff.minimumQuantity) || tariff.minimumQuantity < 0
        || safe(ceilAtoms(BigInt(tariff.minimumChargeMicros) * ATOMS_PER_MICRO, BigInt(tariff.unitPriceAtoms))) !== tariff.minimumQuantity) {
        throw new Error('The accepted usage tariff requires review.');
    }
    return tariff;
}
export const validateUsageTariff = assertUsageTariff;
export function sameUsageTariffRate(left: UsageTariffSnapshot, right: UsageTariffSnapshot): boolean {
    return ['priceId', 'meterId', 'eventName', 'currency', 'usageTier', 'kind', 'quantityUnit', 'aggregation', 'unitPriceAtoms'].every(key =>
        left[key as keyof UsageTariffSnapshot] === right[key as keyof UsageTariffSnapshot]);
}
export function formatUsdAtoms(value: string | bigint): string {
    const atoms = typeof value === 'bigint' ? value : nonnegativeAtoms(value);
    if (atoms < BigInt(0)) throw new Error('Invalid exact USD amount.');
    const digits = atoms.toString().padStart(15, '0'), whole = digits.slice(0, -14), fraction = digits.slice(-14).replace(/0+$/, '');
    return `${whole}${fraction ? `.${fraction}` : ''}`;
}
export function quoteUsageQuantity(tariff: UsageTariffSnapshot, quantity: number) {
    assertUsageTariff(tariff);
    if (!Number.isSafeInteger(quantity) || quantity < 0) throw new Error('Usage quantity must be a nonnegative integer.');
    const exact = BigInt(quantity) * BigInt(tariff.unitPriceAtoms);
    return { quantity, exactAtoms: exact.toString(), floorMicros: safe(exact / ATOMS_PER_MICRO), ceilingMicros: safe(ceilAtoms(exact, ATOMS_PER_MICRO)) };
}
export function minimumBillableQuantity(tariff: UsageTariffSnapshot, quantity: number): number {
    quoteUsageQuantity(tariff, quantity);
    return quantity > 0 ? Math.max(quantity, tariff.minimumQuantity) : 0;
}
export function createUsageAmountAccumulator(tariff: UsageTariffSnapshot): UsageAmountAccumulator {
    assertUsageTariff(tariff);
    return { tariff, quantity: 0, settledExactAtoms: '0', grossEarnedMicros: 0, invoicedExactAtoms: '0', invoicedGrossMicros: 0, roundingReservedMicros: 0 };
}
/** Absolute quantity: callers add recording blocks or raise the monotonic storage peak first. */
export function accumulateUsageCharge(bucket: UsageAmountAccumulator, quantity: number) {
    if (quantity < bucket.quantity) throw new Error('Accepted usage quantity cannot decrease.');
    const quote = quoteUsageQuantity(bucket.tariff, quantity), debitMicros = quote.floorMicros - bucket.grossEarnedMicros;
    if (debitMicros < 0) throw new Error('Accepted usage amount cannot decrease.');
    bucket.quantity = quantity; bucket.settledExactAtoms = quote.exactAtoms; bucket.grossEarnedMicros = quote.floorMicros;
    return { ...quote, debitMicros };
}
export function usageRoundingReserve(bucket: UsageAmountAccumulator): number {
    const unbilled = nonnegativeAtoms(bucket.settledExactAtoms) - nonnegativeAtoms(bucket.invoicedExactAtoms);
    if (unbilled < BigInt(0)) throw new Error('Invoice usage exceeds its accepted source.');
    const earned = bucket.grossEarnedMicros - bucket.invoicedGrossMicros;
    return safe(ceilAtoms(unbilled, ATOMS_PER_CENT) * BigInt(10_000) - BigInt(earned));
}
export function applyUsageInvoiceAmount(bucket: UsageAmountAccumulator, exactAtoms: string, principalMinor: number) {
    if (!Number.isSafeInteger(principalMinor) || principalMinor < 0) throw new Error('Invalid usage invoice principal.');
    const next = nonnegativeAtoms(bucket.invoicedExactAtoms) + nonnegativeAtoms(exactAtoms);
    if (next > nonnegativeAtoms(bucket.settledExactAtoms)) throw new Error('Invoice usage has no matching uninvoiced source.');
    const nextGross = safe(next / ATOMS_PER_MICRO), attributedMicros = nextGross - bucket.invoicedGrossMicros;
    bucket.invoicedExactAtoms = next.toString(); bucket.invoicedGrossMicros = nextGross;
    const invoiceMicros = safe(BigInt(principalMinor) * BigInt(10_000));
    return { attributedMicros, deltaMicros: invoiceMicros - attributedMicros };
}
