import type Stripe from 'stripe';
import { BillingConfigurationError } from './metering';

function decimalRatio(value: number): { numerator: bigint; denominator: bigint } {
    const text = value.toString();
    const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(text);
    if (!match) throw new BillingConfigurationError('The payment exchange rate is invalid.');
    const fraction = match[2] || '', exponent = Number(match[3] || 0) - fraction.length;
    const digits = BigInt(match[1] + fraction);
    return exponent >= 0 ? { numerator: digits * BigInt(10) ** BigInt(exponent), denominator: BigInt(1) }
        : { numerator: digits, denominator: BigInt(10) ** BigInt(-exponent) };
}

/** The v2 USD catalog supports USD and INR settlement. Both have two minor-unit decimals.
 * Stripe's exchange_rate is settlement units per source unit; round cost up, never down. */
export function processorFeeUsdMicros(balance: Stripe.BalanceTransaction): number {
    if (!Number.isSafeInteger(balance.fee) || balance.fee < 0) throw new BillingConfigurationError('The processor fee is invalid.');
    if (balance.currency === 'usd') return balance.fee * 10_000;
    if (balance.currency !== 'inr') throw new BillingConfigurationError(`Settlement currency ${balance.currency} needs a reviewed USD fee conversion before billing can continue.`);
    if (!balance.exchange_rate || !Number.isFinite(balance.exchange_rate) || balance.exchange_rate <= 0) {
        throw new BillingConfigurationError('The INR settlement requires a confirmed USD exchange rate before funding can be recognized.');
    }
    const { numerator, denominator } = decimalRatio(balance.exchange_rate);
    const converted = (BigInt(balance.fee) * BigInt(10_000) * denominator + numerator - BigInt(1)) / numerator;
    if (converted > BigInt(Number.MAX_SAFE_INTEGER)) throw new BillingConfigurationError('The converted processor fee exceeds the supported range.');
    return Number(converted);
}
