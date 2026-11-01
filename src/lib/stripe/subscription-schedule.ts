import 'server-only';
import { createHash } from 'node:crypto';
import type Stripe from 'stripe';
import type { Db } from 'mongodb';
import { Collections } from '@/lib/mongodb';
import { getStripe } from '@/lib/stripe';
import type { Plan, User } from '@/lib/db/types';
import { billingDependencies, type BillingDependencies } from './runtime';
import { billingFence, BillingBusyError, withBillingLease } from './billing-lock';
import { stripeObjectId, subscriptionUsagePeriod } from './objects';
import { verifiedSubscriptionMeters, BillingConfigurationError } from './metering';
import { assertPrepaidGrantsCoverTarget } from './grant-prices';
import type { UsageTariffPair } from './usage-tariff';
import type { BillingChangeOperation } from './plan-change';
import type { UsagePriceRollout } from './usage-price-rollout';
import { BillingSyncPendingError } from './billing-errors';
export { BillingSyncPendingError } from './billing-errors';
import { assertCurrentBasePeriodPaid } from './paid-base-service';

export const BILLING_SCHEDULES = 'billing_subscription_schedules';
export const NORMAL_PRORATION_POLICY_VERSION = 'stripe-proration-v1';
const ownerTag = 'vosift-billing-v1';
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
type Phase = Stripe.SubscriptionScheduleUpdateParams.Phase;
interface ScheduledTransition {
    at: number;
    operationId?: string;
    rolloutId?: string;
    plan?: Plan;
    tariffs?: UsageTariffPair;
    usageCatalogVersion?: string;
}
export interface OwnedBillingSchedule {
    _id: string; authSubject: string; customerId: string; subscriptionId: string; generation: number;
    scheduleId?: string; revision: string; state: 'preparing' | 'scheduled' | 'released';
    transitions: ScheduledTransition[]; params?: Stripe.SubscriptionScheduleUpdateParams;
    createdAt: Date; updatedAt: Date;
    locallyAppliedRevision?: string;
}
const scheduleKey = (user: User) => digest([user.authSubject, user.stripeCustomerId, user.stripeSubscriptionId, user.stripeCustomerGeneration || 0]);
const ids = (tariffs: UsageTariffPair) => ({ storage: tariffs.storage.priceId, transcription: tariffs.transcription.priceId });
export function shouldSyncScheduledBillingBoundary(user: Pick<User, 'billingSchedule'>, now = new Date()): boolean {
    return Boolean(user.billingSchedule?.effectiveAt && user.billingSchedule.effectiveAt <= now
        && user.billingSchedule.state !== 'ready');
}
async function assertOwned(user: User, owner: string, runtime: BillingDependencies) {
    if (!await runtime.db.collection<User>(Collections.USERS).findOne(billingFence(user, owner))
        && !await runtime.db.collection<User>('billing_deleted_accounts').findOne(billingFence(user, owner))) throw new BillingBusyError();
}
async function writeSummary(user: User, owner: string, row: OwnedBillingSchedule, runtime: BillingDependencies, now: Date) {
    const next = row.transitions.find(change => change.at * 1000 > now.getTime());
    const summary: NonNullable<User['billingSchedule']> = { id: row._id, revision: row.revision,
        ...(row.scheduleId ? { scheduleId: row.scheduleId } : {}),
        ...(next ? { effectiveAt: new Date(next.at * 1000) } : {}), state: next ? 'scheduled' : 'ready' };
    const result = await runtime.db.collection<User>(Collections.USERS).updateOne(billingFence(user, owner), { $set: { billingSchedule: summary } });
    if (!result.matchedCount) throw new BillingBusyError();
    user.billingSchedule = summary;
}
export async function assertOwnedSchedule(subscription: Stripe.Subscription, user: User, runtime: BillingDependencies) {
    const id = stripeObjectId(subscription.schedule);
    if (!id) return;
    const schedule = await runtime.stripe.subscriptionSchedules.retrieve(id);
    const intent = !schedule.metadata?.billingOwner && await runtime.db.collection<OwnedBillingSchedule>(BILLING_SCHEDULES).findOne({ _id: scheduleKey(user), state: 'preparing' });
    const recoverableCreate = intent && (!intent.scheduleId || intent.scheduleId === schedule.id)
        && schedule.created >= Math.floor(intent.createdAt.getTime() / 1000) - 60 && schedule.phases.length === 1
        && JSON.stringify(schedule.phases[0].items.map(item => stripeObjectId(item.price)).sort()) === JSON.stringify(subscription.items.data.map(item => item.price.id).sort());
    if ((!recoverableCreate && (schedule.metadata?.billingOwner !== ownerTag || schedule.metadata?.authSubject !== user.authSubject))
        || stripeObjectId(schedule.customer) !== user.stripeCustomerId || stripeObjectId(schedule.subscription) !== subscription.id) {
        throw new BillingConfigurationError('A subscription schedule outside the application must be resolved before changing plans.');
    }
    return schedule;
}
function phaseItems(subscription: Stripe.Subscription): Phase['items'] {
    return subscription.items.data.map(item => ({ price: item.price.id,
        ...(item.price.recurring?.usage_type !== 'metered' ? { quantity: item.quantity || 1 } : {}),
        ...(item.tax_rates?.length ? { tax_rates: item.tax_rates.map(tax => tax.id) } : {}),
        ...(item.discounts?.length ? { discounts: item.discounts.map(discount => ({ discount: stripeObjectId(discount)! })) } : {}) }));
}
function retainedSettings(subscription: Stripe.Subscription, current?: Stripe.SubscriptionSchedule.Phase): Omit<Phase, 'items'> {
    const automatic = current?.automatic_tax || subscription.automatic_tax;
    const payment = stripeObjectId(current?.default_payment_method || subscription.default_payment_method);
    const rates = current?.default_tax_rates || subscription.default_tax_rates;
    const discounts = current?.discounts || subscription.discounts;
    return { collection_method: subscription.collection_method, billing_cycle_anchor: 'automatic',
        ...(automatic ? { automatic_tax: { enabled: automatic.enabled,
            ...(automatic.liability ? { liability: { type: automatic.liability.type, ...(stripeObjectId(automatic.liability.account) ? { account: stripeObjectId(automatic.liability.account)! } : {}) } } : {}) } } : {}),
        ...(payment ? { default_payment_method: payment } : {}),
        ...(rates?.length ? { default_tax_rates: rates.map(rate => stripeObjectId(rate)!) } : {}),
        discounts: discounts?.length ? discounts.map(discount => typeof discount === 'object' && 'discount' in discount
            ? { discount: stripeObjectId(discount.discount)! } : { discount: stripeObjectId(discount as string | { id: string })! }) : '',
        ...(current?.description || subscription.description ? { description: current?.description || subscription.description! } : {}),
        ...(current?.invoice_settings ? { invoice_settings: current.invoice_settings as Phase['invoice_settings'] } : {}),
    };
}
/** Pure phase composition: one phase per distinct boundary, never independent schedules. */
export function composeBillingPhases(subscription: Stripe.Subscription, transitions: ScheduledTransition[], current?: Stripe.SubscriptionSchedule.Phase, sourceTariffs?: UsageTariffPair): Phase[] {
    const phases: Phase[] = [], settings = retainedSettings(subscription, current);
    let items = phaseItems(subscription), previousTariffs = sourceTariffs ? [sourceTariffs.storage.priceId, sourceTariffs.transcription.priceId]
        : subscription.items.data.filter(item => item.price.recurring?.usage_type === 'metered').map(item => item.price.id);
    if (previousTariffs.length !== 2 || subscription.items.data.filter(item => item.price.recurring?.usage_type !== 'metered').length > 1) {
        throw new BillingConfigurationError('A billing schedule requires only the approved base item and two usage items.');
    }
    let start = current?.start_date ?? Math.min(...subscription.items.data.map(item => item.current_period_start));
    const boundaries = [...new Set(transitions.map(change => change.at))].sort((a, b) => a - b);
    for (const at of boundaries) {
        if (!Number.isSafeInteger(at) || at <= start) throw new BillingSyncPendingError('A scheduled transition missed its unmodified future boundary.');
        phases.push({ ...settings, start_date: start, end_date: at, items, proration_behavior: 'none' });
        const group = transitions.filter(change => change.at === at), plan = group.find(change => change.plan)?.plan;
        const tariffs = group.find(change => change.tariffs)?.tariffs;
        if (plan) {
            const base = subscription.items.data.find(item => item.price.recurring?.usage_type !== 'metered');
            if (!base || !plan.stripePriceId) throw new BillingConfigurationError('A scheduled downgrade requires one recurring base item.');
            items = items.map(item => previousTariffs.includes(String(item.price)) ? item : { ...item, price: plan.stripePriceId!, quantity: 1 });
        }
        if (tariffs) {
            const replacements = [tariffs.storage.priceId, tariffs.transcription.priceId];
            // Identify the two physical roles from their saved immutable tariffs,
            // rather than relying on the ordering returned by Stripe.
            items = items.map(item => previousTariffs.includes(String(item.price)) ? { ...item, price: replacements[previousTariffs.indexOf(String(item.price))] } : item);
            previousTariffs = replacements;
        }
        start = at;
    }
    phases.push({ ...settings, start_date: start, duration: { interval: 'month', interval_count: 1 }, items, proration_behavior: 'none' });
    if (phases.length > 10) throw new BillingConfigurationError('Too many pending subscription boundaries require operator review.');
    return phases;
}
async function pendingTransitions(user: User, runtime: BillingDependencies): Promise<ScheduledTransition[]> {
    const operations = await runtime.db.collection<BillingChangeOperation>('billing_operations').find({ authSubject: user.authSubject,
        customerId: user.stripeCustomerId, subscriptionId: user.stripeSubscriptionId, state: 'scheduled' }).toArray();
    const rollouts = await runtime.db.collection<UsagePriceRollout>('billing_usage_price_rollouts').find({ authSubject: user.authSubject,
        customerId: user.stripeCustomerId, subscriptionId: user.stripeSubscriptionId, state: { $in: ['scheduled', 'prepared', 'applying'] }, noticedAt: { $exists: true } }).toArray();
    return [...operations.map(operation => ({ at: Math.floor(new Date(operation.preview.effectiveAt).getTime() / 1000), operationId: operation._id,
        plan: operation.target })), ...rollouts.map(row => ({ at: Math.floor(row.effectiveAt!.getTime() / 1000), rolloutId: row._id,
        tariffs: row.targetTariffs, usageCatalogVersion: row.targetCatalogVersion }))].sort((left, right) => left.at - right.at);
}
/** Caller owns the billing lease. Stripe executes the prepared phases even if cron is late. */
export async function coordinateBillingSchedule(user: User, owner: string, runtime: BillingDependencies, now = new Date()): Promise<void> {
    await assertOwned(user, owner, runtime);
    const changes = await pendingTransitions(user, runtime), subscription = await runtime.stripe.subscriptions.retrieve(user.stripeSubscriptionId!);
    if (stripeObjectId(subscription.customer) !== user.stripeCustomerId || subscription.status !== 'active' || subscription.pending_update
        || subscription.cancel_at || subscription.cancel_at_period_end || subscription.items.has_more) throw new BillingSyncPendingError();
    let remote = await assertOwnedSchedule(subscription, user, runtime);
    const future = changes.filter(change => change.at * 1000 > now.getTime());
    if (future.length !== changes.length) throw new BillingSyncPendingError('A due billing transition must be confirmed before another schedule is prepared.');
    if (!future.length) {
        if (remote) {
            await assertOwned(user, owner, runtime);
            await runtime.stripe.subscriptionSchedules.release(remote.id, { preserve_cancel_date: false }, { idempotencyKey: `billing-schedule-release:${remote.id}` });
        }
        await runtime.db.collection<OwnedBillingSchedule>(BILLING_SCHEDULES).updateOne({ _id: scheduleKey(user) }, { $set: { state: 'released', updatedAt: now } });
        await runtime.db.collection<User>(Collections.USERS).updateOne(billingFence(user, owner), { $unset: { billingSchedule: '' } });
        delete user.billingSchedule; return;
    }
    if (future.some(change => change.tariffs)) for (const change of future) if (change.tariffs) await assertPrepaidGrantsCoverTarget(user, ids(change.tariffs), runtime.stripe, runtime.db);
    const _id = scheduleKey(user), revision = digest(future), rows = runtime.db.collection<OwnedBillingSchedule>(BILLING_SCHEDULES);
    let row = await rows.findOne({ _id });
    if (!row) {
        row = { _id, authSubject: user.authSubject, customerId: user.stripeCustomerId!, subscriptionId: subscription.id, generation: user.stripeCustomerGeneration || 0,
            revision, transitions: future, state: 'preparing', createdAt: now, updatedAt: now };
        await rows.insertOne(row);
    }
    const marker: NonNullable<User['billingSchedule']> = { id: _id, revision, scheduleId: remote?.id || row.scheduleId,
        effectiveAt: new Date(future[0].at * 1000), state: 'preparing' };
    await runtime.db.collection<User>(Collections.USERS).updateOne(billingFence(user, owner), { $set: { billingSchedule: marker } });
    user.billingSchedule = marker;
    if (!remote) {
        if (row.scheduleId) {
            const prior = await runtime.stripe.subscriptionSchedules.retrieve(row.scheduleId);
            if (['active', 'not_started'].includes(prior.status)) remote = prior;
        }
        if (!remote) {
            await assertOwned(user, owner, runtime);
            remote = await runtime.stripe.subscriptionSchedules.create({ from_subscription: subscription.id }, { idempotencyKey: `billing-schedule-create:${_id}:${revision}` });
        }
        row.scheduleId = remote.id;
        await rows.updateOne({ _id }, { $set: { scheduleId: remote.id, state: 'preparing', updatedAt: now } });
    }
    const current = remote.phases.find(phase => phase.start_date <= now.getTime() / 1000 && phase.end_date > now.getTime() / 1000) || remote.phases[0];
    const params: Stripe.SubscriptionScheduleUpdateParams = { phases: composeBillingPhases(subscription, future, current, user.billingUsageTariffs),
        end_behavior: 'release', proration_behavior: 'none', metadata: { billingOwner: ownerTag, authSubject: user.authSubject, billingScheduleId: _id, revision } };
    await rows.updateOne({ _id }, { $set: { params, revision, transitions: future, state: 'preparing', updatedAt: now } });
    await assertOwned(user, owner, runtime);
    const verified = await runtime.stripe.subscriptionSchedules.update(remote.id, params, { idempotencyKey: `billing-schedule-prepare:${_id}:${revision}` });
    if (verified.metadata?.revision !== revision || stripeObjectId(verified.subscription) !== subscription.id) throw new BillingSyncPendingError();
    Object.assign(row, { scheduleId: remote.id, revision, transitions: future, state: 'scheduled', params, updatedAt: now });
    await rows.updateOne({ _id }, { $set: { scheduleId: remote.id, revision, transitions: future, state: 'scheduled', params, updatedAt: now } });
    await writeSummary(user, owner, row, runtime, now);
}

/** Adopt all due phase effects together before the ledger opens a renewal window. */
export async function syncOwnedBillingScheduleBoundary(user: User, owner: string, runtime: BillingDependencies, now = new Date()): Promise<User> {
    if (!shouldSyncScheduledBillingBoundary(user, now)) return user;
    const row = await runtime.db.collection<OwnedBillingSchedule>(BILLING_SCHEDULES).findOne({ _id: user.billingSchedule!.id });
    if (!row || row.customerId !== user.stripeCustomerId || row.subscriptionId !== user.stripeSubscriptionId
        || row.generation !== (user.stripeCustomerGeneration || 0) || !['scheduled', 'preparing'].includes(row.state)
        || row.revision !== user.billingSchedule!.revision) throw new BillingSyncPendingError();
    const due = row.transitions.filter(change => change.at * 1000 <= now.getTime());
    if (!due.length) return user;
    const subscription = await runtime.stripe.subscriptions.retrieve(row.subscriptionId);
    if (stripeObjectId(subscription.customer) !== row.customerId || subscription.status !== 'active') throw new BillingSyncPendingError();
    if (!row.scheduleId) throw new BillingSyncPendingError();
    const remoteSchedule = await runtime.stripe.subscriptionSchedules.retrieve(row.scheduleId);
    const linkedSubscription = stripeObjectId(remoteSchedule.subscription) || remoteSchedule.released_subscription;
    if (remoteSchedule.metadata?.billingOwner !== ownerTag || remoteSchedule.metadata?.billingScheduleId !== row._id
        || remoteSchedule.metadata?.revision !== row.revision || remoteSchedule.metadata?.authSubject !== user.authSubject
        || stripeObjectId(remoteSchedule.customer) !== row.customerId || linkedSubscription !== subscription.id
        || !['active', 'completed'].includes(remoteSchedule.status)) throw new BillingSyncPendingError();
    const expectedPhase = row.params?.phases?.filter(phase => Number(phase.start_date) <= now.getTime() / 1000).at(-1);
    const actualPhase = remoteSchedule.phases.find(phase => phase.start_date === Number(expectedPhase?.start_date));
    const itemIds = (items: { price?: unknown; quantity?: number }[]) => items.map(item => [stripeObjectId(item.price as string | { id: string }), item.quantity || 0]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    if (!expectedPhase || !actualPhase || JSON.stringify(itemIds(actualPhase.items)) !== JSON.stringify(itemIds(expectedPhase.items))) throw new BillingSyncPendingError();
    if (row.state === 'preparing') {
        await runtime.db.collection<OwnedBillingSchedule>(BILLING_SCHEDULES).updateOne({ _id: row._id, revision: row.revision }, { $set: { state: 'scheduled', updatedAt: now } });
        row.state = 'scheduled';
    }
    const targetPlan = due.filter(change => change.plan).at(-1)?.plan;
    const usage = due.filter(change => change.tariffs).at(-1);
    const tariffs = usage?.tariffs || user.billingUsageTariffs;
    if (!tariffs || !verifiedSubscriptionMeters(subscription, ids(tariffs))) throw new BillingSyncPendingError();
    const base = subscription.items.data.filter(item => item.price.recurring?.usage_type !== 'metered');
    if (targetPlan && (base.length !== 1 || base[0].price.id !== targetPlan.stripePriceId || base[0].quantity !== 1)) throw new BillingSyncPendingError();
    const usagePeriod = subscriptionUsagePeriod(subscription);
    if (!usagePeriod.start || !usagePeriod.end || usagePeriod.start.getTime() < due.at(-1)!.at * 1000) throw new BillingSyncPendingError();
    const values: Record<string, unknown> = { stripeMetering: { subscriptionId: subscription.id, storagePriceId: tariffs.storage.priceId,
        transcriptionPriceId: tariffs.transcription.priceId, verifiedAt: now }, stripeCurrentPeriodStart: usagePeriod.start, stripeCurrentPeriodEnd: usagePeriod.end };
    if (base.length) {
        const paid = await assertCurrentBasePeriodPaid(subscription, user, runtime);
        if (paid) values.billingPaidBasePeriod = paid;
    }
    if (targetPlan) Object.assign(values, { planKey: targetPlan.key, stripePriceId: targetPlan.stripePriceId,
        billingCatalogVersion: targetPlan.billingCatalogVersion, storageAllocation: targetPlan.limits.storage, transcriptionAllocation: targetPlan.limits.transcription });
    if (usage) Object.assign(values, { billingUsageTariffs: tariffs, billingUsageCatalogVersion: usage.usageCatalogVersion });
    // Keep the due marker until operation and rollout journals are acknowledged.
    // A crash after entitlement CAS then safely repeats this same adoption.
    values.billingSchedule = { id: row._id, revision: row.revision, scheduleId: row.scheduleId,
        effectiveAt: new Date(due[0].at * 1000), state: 'sync_pending' };
    const result = await runtime.db.collection<User>(Collections.USERS).updateOne(billingFence(user, owner), { $set: values });
    if (!result.matchedCount) throw new BillingBusyError();
    Object.assign(user, values);
    for (const change of due) {
        if (change.operationId) await runtime.db.collection<BillingChangeOperation>('billing_operations').updateOne({ _id: change.operationId, state: 'scheduled' },
            { $set: { state: 'applied', appliedAt: now, updatedAt: now } });
        if (change.rolloutId) await runtime.db.collection<UsagePriceRollout>('billing_usage_price_rollouts').updateOne({ _id: change.rolloutId, state: { $nin: ['applied', 'canceled'] } },
            { $set: { state: 'applied', appliedAt: now, updatedAt: now } });
    }
    if (user.billingUsagePriceRollout && due.some(change => change.rolloutId === user.billingUsagePriceRollout!.id)) {
        user.billingUsagePriceRollout = { ...user.billingUsagePriceRollout, state: 'applied' };
        await runtime.db.collection<User>(Collections.USERS).updateOne(billingFence(user, owner), { $set: { billingUsagePriceRollout: user.billingUsagePriceRollout } });
    }
    await runtime.db.collection<OwnedBillingSchedule>(BILLING_SCHEDULES).updateOne({ _id: row._id, revision: row.revision }, { $set: { locallyAppliedRevision: row.revision, updatedAt: now } });
    await writeSummary(user, owner, row, runtime, now);
    return user;
}
export async function syncScheduledBillingBoundary(subject: string, dependencies?: { db: Db; stripe?: Stripe }, now = new Date()): Promise<User> {
    const runtime = dependencies ? { db: dependencies.db, stripe: dependencies.stripe || getStripe() } : await billingDependencies();
    return withBillingLease(runtime.db, subject, (user, owner) => syncOwnedBillingScheduleBoundary(user, owner, runtime, now));
}

/** Release only after upgrade payment is authoritative. Pending usage notices remain durable. */
export async function releaseScheduleForPaidUpgrade(user: User, owner: string, runtime: BillingDependencies) {
    const subscription = await runtime.stripe.subscriptions.retrieve(user.stripeSubscriptionId!);
    const remote = await assertOwnedSchedule(subscription, user, runtime);
    if (remote) {
        await assertOwned(user, owner, runtime);
        await runtime.stripe.subscriptionSchedules.release(remote.id, { preserve_cancel_date: false }, { idempotencyKey: `paid-upgrade-release:${remote.id}` });
    }
    const pending = await runtime.db.collection<BillingChangeOperation>('billing_operations').find({ authSubject: user.authSubject, customerId: user.stripeCustomerId, state: 'scheduled' }).toArray();
    for (const operation of pending) await runtime.db.collection<BillingChangeOperation>('billing_operations').updateOne({ _id: operation._id, state: 'scheduled' },
        { $set: { state: 'canceled', error: 'Replaced by a successfully paid upgrade.', updatedAt: new Date() } });
    return runtime.stripe.subscriptions.retrieve(subscription.id);
}

/** Erasure retires future app phases; its independent settlement owns cancellation of service. */
export async function cancelOwnedBillingScheduleForClosedAccount(user: User, owner: string, runtime: BillingDependencies) {
    if (user.stripeSubscriptionId) {
        const subscription = await runtime.stripe.subscriptions.retrieve(user.stripeSubscriptionId);
        const id = stripeObjectId(subscription.schedule);
        if (id) {
            const schedule = await runtime.stripe.subscriptionSchedules.retrieve(id);
            if (stripeObjectId(schedule.customer) !== user.stripeCustomerId || schedule.metadata?.billingOwner !== ownerTag
                || schedule.metadata?.authSubject !== user.authSubject) throw new BillingSyncPendingError('The closed account schedule needs ownership reconciliation.');
            if (['active', 'not_started'].includes(schedule.status)) {
                await assertOwned(user, owner, runtime);
                await runtime.stripe.subscriptionSchedules.release(id, { preserve_cancel_date: true }, { idempotencyKey: `closed-account-schedule-release:${id}` });
            }
        }
    }
    await runtime.db.collection<OwnedBillingSchedule>(BILLING_SCHEDULES).updateOne({ _id: scheduleKey(user) }, { $set: { state: 'released', updatedAt: new Date() } });
    for (const collection of [Collections.USERS, 'billing_deleted_accounts']) await runtime.db.collection<User>(collection).updateOne(billingFence(user, owner), { $unset: { billingSchedule: '' } });
    delete user.billingSchedule;
    const rollouts = await runtime.db.collection<UsagePriceRollout>('billing_usage_price_rollouts').find({ authSubject: user.authSubject,
        customerId: user.stripeCustomerId, scheduleCoordinator: 1, state: { $nin: ['applied', 'canceled'] } }).toArray();
    for (const rollout of rollouts) await runtime.db.collection<UsagePriceRollout>('billing_usage_price_rollouts').updateOne({ _id: rollout._id }, { $set: { state: 'canceled', updatedAt: new Date() } });
}
