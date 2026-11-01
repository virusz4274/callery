import type Stripe from 'stripe';
import { clone, planFixture } from './test-support';
import { transferFixture, rolloutTariffs } from './grant-transfer.test-support';
import type { BillingChangeOperation } from './plan-change';
import type { UsagePriceRollout } from './usage-price-rollout';

/** A remote schedule advances independently of application reconciliation. */
export function scheduleFixture(withFunds = false) {
    const value = transferFixture(withFunds), stripe = value.stripe;
    const subscription = stripe.subscriptionValues.get('sub_owner')!;
    Object.assign(subscription, { collection_method: 'charge_automatically', currency: 'usd', metadata: {}, billing_cycle_anchor: 1790812800,
        automatic_tax: { enabled: false }, discounts: [], default_tax_rates: [] });
    const pro = { id: 'price_pro', product: 'prod_pro', recurring: { usage_type: 'licensed', interval: 'month', interval_count: 1 }, unit_amount: 2000 } as Stripe.Price;
    subscription.items.data.unshift({ id: 'si_base', price: pro, quantity: 1, current_period_start: 1790812800, current_period_end: 1793491200 } as Stripe.SubscriptionItem);
    value.memory.user().planKey = 'pro'; value.memory.user().stripePriceId = pro.id;
    value.memory.user().billingPaidBasePeriod = { customerId: 'cus_owner', customerGeneration: 0, subscriptionId: subscription.id,
        basePriceId: pro.id, start: new Date(1790812800000), end: new Date(1793491200000), invoiceId: 'in_source_paid' };
    const standard = planFixture({ limits: { storage: 200, transcription: 600 } }), target = rolloutTariffs('new');
    const schedules = new Map<string, Stripe.SubscriptionSchedule>(), keys = new Map<string, string>();
    const state = { creates: 0, updates: 0, releases: 0, loseCreate: false, loseUpdate: false };
    Object.assign(stripe, { subscriptionSchedules: {
        retrieve: async (id: string) => { if (!schedules.has(id)) throw new Error('Unknown schedule'); return clone(schedules.get(id)!); },
        create: async (_params: Stripe.SubscriptionScheduleCreateParams, options: { idempotencyKey: string }) => {
            const prior = keys.get(options.idempotencyKey); if (prior) return clone(schedules.get(prior)!);
            state.creates++;
            const id = `sub_sched_${state.creates}`, row = { id, customer: 'cus_owner', subscription: subscription.id, status: 'active', metadata: {},
                created: Math.floor(Date.now() / 1000), end_behavior: 'release', current_phase: { start_date: 1790812800, end_date: 1793491200 },
                phases: [{ start_date: 1790812800, end_date: 1793491200, items: subscription.items.data.map(item => ({ price: item.price.id, quantity: item.quantity })) }] } as unknown as Stripe.SubscriptionSchedule;
            schedules.set(id, row); keys.set(options.idempotencyKey, id); subscription.schedule = id;
            if (state.loseCreate) { state.loseCreate = false; throw new Error('Schedule create response lost'); }
            return clone(row);
        },
        update: async (id: string, params: Stripe.SubscriptionScheduleUpdateParams) => {
            state.updates++; const row = schedules.get(id)!;
            Object.assign(row, { metadata: params.metadata, end_behavior: params.end_behavior,
                phases: params.phases!.map(phase => ({ ...clone(phase), end_date: phase.end_date || Number(phase.start_date) + 31 * 86400,
                    start_date: Number(phase.start_date), items: phase.items.map(item => ({ ...item, price: String(item.price) })) })) });
            if (state.loseUpdate) { state.loseUpdate = false; throw new Error('Schedule update response lost'); }
            return clone(row);
        },
        release: async (id: string) => { state.releases++; const row = schedules.get(id)!; row.status = 'released'; row.released_subscription = subscription.id;
            row.subscription = null; subscription.schedule = null; return clone(row); },
    } });
    Object.assign(stripe, { invoicePayments: { list: ({ invoice }: { invoice: string }) => ({ async *[Symbol.asyncIterator]() {
        const row = stripe.invoiceValues.get(invoice); if (row?.status === 'paid' && row.amount_paid > 0) yield { invoice, status: 'paid', currency: 'usd', amount_paid: row.amount_paid,
            payment: { type: 'payment_intent', payment_intent: `pi_${invoice}` } };
    } }) }, paymentIntents: { retrieve: async (id: string) => ({ id, customer: 'cus_owner', currency: 'usd', status: 'succeeded', amount_received: 1000,
        latest_charge: { paid: true, refunded: false, disputed: false, amount_refunded: 0 } }) } });
    const addDowngrade = (at = new Date('2026-12-01')) => {
        const operation = { _id: 'downgrade', authSubject: 'owner', customerId: 'cus_owner', subscriptionId: subscription.id, state: 'scheduled', kind: 'plan_change',
            target: standard, createdAt: new Date(), updatedAt: new Date(), expiresAt: new Date('2099-01-01'), params: {}, sourceFingerprint: 'fixture', sourcePlanKey: 'pro',
            preview: { id: 'downgrade', expiresAt: '2099-01-01', effectiveAt: at.toISOString(), timing: 'period_end', scheduled: true,
                amountDueMinor: 0, baseCreditMinor: 0, retainedCreditMinor: 0, targetPlanKey: standard.key, currency: 'usd', rates: value.tariffs } } as BillingChangeOperation;
        value.memory.collection('billing_operations').values.push(operation as never); return operation;
    };
    const addRollout = (at = new Date('2026-12-01')) => {
        const row = { _id: 'rollout', authSubject: 'owner', customerId: 'cus_owner', generation: 0, subscriptionId: subscription.id,
            sourceTariffs: value.tariffs, targetTariffs: target, targetCatalogVersion: 'new:standard', targetBundleId: 'bundle_new', publicationId: 'publication',
            state: 'scheduled', scheduleCoordinator: 1, noticedAt: new Date('2026-10-21'), emailSentAt: new Date('2026-10-21'), inAppNotifiedAt: new Date('2026-10-21'),
            effectiveAt: at, targetPriceIds: [target.storage.priceId, target.transcription.priceId], createdAt: new Date(), updatedAt: new Date() } as UsagePriceRollout;
        value.memory.collection('billing_usage_price_rollouts').values.push(row as never); return row;
    };
    const advance = (now: Date, paid = true) => {
        const schedule = schedules.get(String(subscription.schedule));
        const phase = schedule?.phases.find(phase => phase.start_date <= now.getTime() / 1000 && phase.end_date > now.getTime() / 1000);
        if (!phase) throw new Error('No prepared remote phase');
        subscription.items.data = phase.items.map((item, index) => {
            const price = String(item.price), metered = price.includes('storage') || price.includes('transcription');
            return { id: `si_phase_${index}`, price: { id: price, recurring: { usage_type: metered ? 'metered' : 'licensed', interval: 'month', interval_count: 1 } },
                quantity: metered ? undefined : item.quantity || 1, current_period_start: phase.start_date, current_period_end: phase.end_date } as Stripe.SubscriptionItem;
        });
        schedule!.current_phase = { start_date: phase.start_date, end_date: phase.end_date };
        const base = subscription.items.data.find(item => item.price.recurring?.usage_type !== 'metered');
        if (base) {
            const invoice = { id: 'in_renewal', customer: 'cus_owner', status: paid ? 'paid' : 'draft', currency: 'usd', amount_paid: paid ? 1000 : 0, amount_due: 1000,
                amount_remaining: paid ? 0 : 1000, parent: { subscription_details: { subscription: subscription.id } }, lines: { data: [{ id: 'il_base', currency: 'usd', quantity: 1,
                    amount: 1000, period: { start: base.current_period_start, end: base.current_period_end }, pricing: { price_details: { price: base.price.id } },
                    parent: { type: 'subscription_item_details', subscription_item_details: { subscription: subscription.id, subscription_item: base.id, proration: false } } }], has_more: false } } as unknown as Stripe.Invoice;
            stripe.invoiceValues.set(invoice.id, invoice); subscription.latest_invoice = invoice.id;
        }
    };
    return { ...value, standard, target, subscription, schedules, state, addDowngrade, addRollout, advance };
}
