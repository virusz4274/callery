import type Stripe from 'stripe';
import type { User } from '@/lib/db/types';

export function localSubscriptionStatus(value: string): NonNullable<User['stripeSubscriptionStatus']> {
    const known = ['active', 'canceled', 'past_due', 'unpaid', 'incomplete', 'incomplete_expired', 'trialing', 'paused'];
    return known.includes(value) ? value as NonNullable<User['stripeSubscriptionStatus']> : 'incomplete';
}

export function stripeObjectId(value: string | { id: string } | null | undefined): string | null {
    return typeof value === 'string' ? value : value?.id ?? null;
}
/** Webhook endpoints may be pinned to an older API version than the SDK. */
export function getInvoiceSubscriptionId(invoice: unknown): string | null {
    const shape = invoice as {
        parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null;
        subscription?: string | { id: string } | null;
    } | null;
    return stripeObjectId(shape?.parent?.subscription_details?.subscription) || stripeObjectId(shape?.subscription);
}
export function subscriptionPeriodEnd(subscription: Stripe.Subscription): Date | undefined {
    const ends = subscription.items.data.map(item => item.current_period_end).filter((value): value is number => typeof value === 'number');
    const end = ends.length ? Math.min(...ends) : subscription.ended_at ?? subscription.cancel_at ?? subscription.canceled_at;
    return typeof end === 'number' ? new Date(end * 1000) : undefined;
}
export function subscriptionPeriodStart(subscription: Stripe.Subscription): Date | undefined {
    const starts = subscription.items.data.map(item => item.current_period_start).filter((value): value is number => typeof value === 'number');
    return starts.length ? new Date(Math.max(...starts) * 1000) : undefined;
}

/** Base access and monthly usage are independent on flexible subscriptions. */
export function subscriptionUsagePeriod(subscription: Stripe.Subscription): { start?: Date; end?: Date } {
    const items = subscription.items.data.filter(item => item.price.recurring?.usage_type === 'metered');
    if (items.length !== 2 || items.some(item => item.current_period_start !== items[0].current_period_start
        || item.current_period_end !== items[0].current_period_end)) return {};
    return { start: new Date(items[0].current_period_start * 1000), end: new Date(items[0].current_period_end * 1000) };
}

export function invoiceLinePriceId(line: Stripe.InvoiceLineItem): string | null {
    const current = stripeObjectId(line.pricing?.price_details?.price);
    return current || stripeObjectId((line as unknown as { price?: string | { id: string } }).price);
}
