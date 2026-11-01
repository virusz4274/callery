import 'server-only';
import { createHash } from 'node:crypto';
import { MongoServerError, ObjectId } from 'mongodb';
import type { Notification, User } from '@/lib/db/types';
import { Collections } from '@/lib/mongodb';
import { sendNotificationEmail } from '@/lib/email';
import { env } from '@/lib/env';
import { billingDependencies, type BillingDependencies } from './runtime';
import { withBillingLease, billingFence, BillingBusyError } from './billing-lock';
import { getBillingAccount } from './ledger';
import { getPublishedCatalogBundle } from './catalog-bundle';
import type { UsageTariffPair } from './usage-tariff';
import { prepareGrantTransfer, GrantTransferReviewError, GrantTransferFundingPendingError, hasUncertainGrantTransfer, reconcileGrantLineages, verifyTransferredFunding, type GrantTransfer } from './grant-transfer';
import { stripeObjectId } from './objects';
import { usagePricingTier } from './catalog';
import { coordinateBillingSchedule, syncOwnedBillingScheduleBoundary, BillingSyncPendingError } from './subscription-schedule';
import { hasBlockingFinancialReview, hasBlockingBillingReview } from './financial-review';
import { assertPrepaidGrantsCoverTarget } from './grant-prices';

export const USAGE_PRICE_ROLLOUTS = 'billing_usage_price_rollouts';
export const NOTICE_DAYS = 30;
export const PREPARATION_HOURS = 24;
interface HeldInvoice { id: string; autoAdvance: boolean; restoredAt?: Date }
export interface UsagePriceRollout {
    _id: string; authSubject: string; customerId: string; generation: number; subscriptionId: string;
    previousBundleId?: string; targetBundleId: string; publicationId: string; targetCatalogVersion: string; sourceTariffs: UsageTariffPair; targetTariffs: UsageTariffPair;
    state: 'notifying' | 'scheduled' | 'preparing' | 'prepared' | 'applying' | 'applied' | 'canceled' | 'needs_review';
    createdAt: Date; updatedAt: Date; emailSentAt?: Date; inAppNotifiedAt?: Date; noticedAt?: Date;
    effectiveAt?: Date; preparedAt?: Date; appliedAt?: Date; checkedAt?: Date; lastError?: string;
    targetPriceIds: string[]; heldInvoices?: HeldInvoice[]; preparationStartedAt?: Date; remoteStartedAt?: Date;
    /** Absent only on accepted legacy grant-transfer operations. */
    scheduleCoordinator?: 1;
}
export interface RolloutDependencies extends BillingDependencies {
    now?: () => Date;
    sendEmail?: typeof sendNotificationEmail;
}
type RolloutUser = User & { billingUsageTariffs?: UsageTariffPair;
    billingGrantTransfer?: { operationId: string; startedAt: Date; reason: string };
    billingUsagePriceRollout?: { id: string; state: string; effectiveAt?: Date; targetBundleId: string; noticedAt?: Date } };
function hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
const pairIds = (pair: UsageTariffPair) => [pair.storage.priceId, pair.transcription.priceId];
const samePair = (left: UsageTariffPair, right: UsageTariffPair) => (['storage', 'transcription'] as const).every(kind => left[kind].priceId === right[kind].priceId
    && left[kind].unitPriceAtoms === right[kind].unitPriceAtoms && left[kind].minimumChargeMicros === right[kind].minimumChargeMicros
    && left[kind].eventName === right[kind].eventName && left[kind].quantityUnit === right[kind].quantityUnit);
function plusMonth(value: Date, day: number) {
    const result = new Date(value); result.setUTCDate(1); result.setUTCMonth(result.getUTCMonth() + 1);
    result.setUTCDate(Math.min(day, new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate())); return result;
}
export function nextNoticedUsageBoundary(boundary: Date, notBefore: Date, anchorDay = boundary.getUTCDate()): Date {
    if (!Number.isFinite(boundary.getTime()) || !Number.isFinite(notBefore.getTime())) throw new Error('The monthly usage boundary requires verification.');
    let value = new Date(boundary);
    for (let count = 0; value < notBefore && count < 1200; count++) value = plusMonth(value, anchorDay);
    if (value < notBefore) throw new Error('The usage-price notice date exceeds the supported window.');
    return value;
}
async function boundaryFor(user: RolloutUser, runtime: BillingDependencies): Promise<{ boundary: Date; anchorDay: number }> {
    const account = getBillingAccount(user), period = account.currentPeriodId && account.periods[account.currentPeriodId];
    if (period) return { boundary: period.end, anchorDay: account.usageAnchorDay || period.start.getUTCDate() };
    if (!user.stripeSubscriptionId || !user.billingUsageTariffs) throw new Error('The original monthly usage window must be established before scheduling prices.');
    const subscription = await runtime.stripe.subscriptions.retrieve(user.stripeSubscriptionId);
    const prices = new Set(pairIds(user.billingUsageTariffs));
    const items = subscription.items.data.filter(item => prices.has(item.price.id));
    if (items.length !== 2 || items.some(item => item.current_period_end !== items[0].current_period_end)) throw new Error('The monthly usage items do not share a verified renewal boundary.');
    return { boundary: new Date(items[0].current_period_end * 1000), anchorDay: new Date(items[0].current_period_start * 1000).getUTCDate() };
}
function summary(row: UsagePriceRollout) { return { id: row._id, state: row.state, targetBundleId: row.targetBundleId, effectiveAt: row.effectiveAt, noticedAt: row.noticedAt }; }
async function save(row: UsagePriceRollout, patch: Partial<UsagePriceRollout>, runtime: BillingDependencies) {
    Object.assign(row, patch, { updatedAt: new Date() });
    await runtime.db.collection<UsagePriceRollout>(USAGE_PRICE_ROLLOUTS).updateOne({ _id: row._id }, { $set: { ...patch, updatedAt: row.updatedAt } });
}
async function writeSummary(user: RolloutUser, owner: string, row: UsagePriceRollout, runtime: BillingDependencies) {
    const collection = await accountCollection(user, runtime);
    const updated = await runtime.db.collection<RolloutUser>(collection).updateOne(billingFence(user, owner), { $set: { billingUsagePriceRollout: summary(row) } });
    if (!updated.matchedCount) throw new Error('The usage-price account generation changed.');
}
async function accountCollection(user: User, runtime: BillingDependencies) {
    return await runtime.db.collection<User>(Collections.USERS).findOne({ _id: user._id }) ? Collections.USERS : 'billing_deleted_accounts';
}
/** Publication creates work; it does not mutate any existing subscription. */
export async function scheduleCatalogUsageRollouts(previousBundleId: string | undefined, newBundleId: string, dependencies?: BillingDependencies, publicationId?: string) {
    const runtime = await billingDependencies(dependencies), bundle = await getPublishedCatalogBundle(newBundleId, runtime.db);
    if (!bundle || bundle.state !== 'published') throw new Error('Publish the complete usage catalog before scheduling notices.');
    const pointer = !publicationId && await runtime.db.collection<{ _id: string; bundleId?: string; revision: number }>('billing_catalog_state').findOne({ _id: 'active' });
    const publication = publicationId || (pointer && pointer.bundleId === newBundleId ? `${newBundleId}:revision:${pointer.revision}` : `${newBundleId}:initial`);
    let scheduled = 0;
    for await (const candidate of runtime.db.collection<RolloutUser>(Collections.USERS).find({ 'billingEntitlement.source': { $in: ['subscription', 'lifetime'] }, stripeCustomerId: { $exists: true }, stripeSubscriptionId: { $exists: true }, disabled: { $ne: true }, 'softDelete.isDeleted': { $ne: true } })) {
        try { await withBillingLease(runtime.db, candidate.authSubject, async value => {
        const user = value as RolloutUser;
        if (user.disabled || user.softDelete?.isDeleted || !user.stripeCustomerId || !user.stripeSubscriptionId || !['subscription', 'lifetime'].includes(user.billingEntitlement?.source || '')) return;
        const tier = usagePricingTier(user), target = bundle.plans.find(entry => entry.plan.key === user.planKey && entry.usageTariffs.storage.usageTier === tier)
            || bundle.plans.find(entry => entry.usageTariffs.storage.usageTier === tier);
        if (!target || !user.billingUsageTariffs || samePair(user.billingUsageTariffs, target.usageTariffs)) return;
        // Serialize notices for one account. A newer publication remains in
        // the active-pointer sweep and is scheduled after this transition.
        if (await runtime.db.collection<UsagePriceRollout>(USAGE_PRICE_ROLLOUTS).findOne({ authSubject: user.authSubject, state: { $nin: ['applied', 'canceled'] } })) return;
        const id = hash(`usage-rollout:${user.authSubject}:${user.stripeCustomerId}:${publication}:${tier}:${user.billingEntitlement?.grantedAt?.toISOString() || ''}`);
        const existing = await runtime.db.collection<UsagePriceRollout>(USAGE_PRICE_ROLLOUTS).findOne({ _id: id });
        if (existing) return;
        const row: UsagePriceRollout = { _id: id, authSubject: user.authSubject, customerId: user.stripeCustomerId!, generation: user.stripeCustomerGeneration || 0,
            subscriptionId: user.stripeSubscriptionId!, previousBundleId, targetBundleId: newBundleId, publicationId: publication, targetCatalogVersion: target.catalogVersion, sourceTariffs: user.billingUsageTariffs, targetTariffs: target.usageTariffs,
            targetPriceIds: [...new Set([...pairIds(user.billingUsageTariffs), ...bundle.plans.flatMap(entry => pairIds(entry.usageTariffs))])].sort(),
            state: 'notifying', scheduleCoordinator: 1, createdAt: new Date(), updatedAt: new Date() };
        try { await runtime.db.collection<UsagePriceRollout>(USAGE_PRICE_ROLLOUTS).insertOne(row); scheduled++; }
        catch (error) { if (!(error instanceof MongoServerError && error.code === 11000)) throw error; }
        }); } catch (error) {
            // A concurrent billing owner wins. The active-pointer sweep retries
            // this account instead of creating overlapping rollout notices.
            if (!(error instanceof BillingBusyError)) throw error;
        }
    }
    return scheduled;
}
/** Pending grants may cover only terms that were actually sent to the owner. */
export async function pendingUsageGrantPriceIds(user: User, runtime: BillingDependencies): Promise<string[]> {
    const jobs = await runtime.db.collection<UsagePriceRollout>(USAGE_PRICE_ROLLOUTS).find({ authSubject: user.authSubject, customerId: user.stripeCustomerId,
        noticedAt: { $exists: true }, state: { $in: ['scheduled', 'preparing', 'prepared', 'applying'] } }).toArray();
    return [...new Set(jobs.flatMap(row => row.targetPriceIds))].sort();
}
function priceNotice(row: UsagePriceRollout, effectiveAt: Date) {
    const date = effectiveAt.toISOString(), old = row.sourceTariffs, next = row.targetTariffs;
    return `Your usage prices change at the monthly usage renewal on or after ${date}. `
        + `Transcription: ${old.transcription.unitAmountDecimal} to ${next.transcription.unitAmountDecimal} USD cents per weighted 15-second block. `
        + `Storage: ${old.storage.unitAmountDecimal} to ${next.storage.unitAmountDecimal} USD cents per milliGiB of monthly peak. `
        + 'Your base plan price, existing prepaid balance, accepted recordings and Lifetime ownership do not change. '
        + 'If preparation is delayed, your current usage prices continue until a later monthly renewal. Review prices or cancel in billing settings.';
}
async function notify(user: RolloutUser, owner: string, row: UsagePriceRollout, runtime: RolloutDependencies, now: Date) {
    const dates = await boundaryFor(user, runtime);
    const effective = nextNoticedUsageBoundary(dates.boundary, new Date(now.getTime() + NOTICE_DAYS * 86400_000 + 3600_000), dates.anchorDay);
    const message = priceNotice(row, effective), notificationId = new ObjectId(hash(`usage-notice:${row._id}`).slice(0, 24));
    if (!row.inAppNotifiedAt) {
        try { await runtime.db.collection<Notification>(Collections.NOTIFICATIONS).insertOne({ _id: notificationId, userId: user._id, type: 'info', title: 'Upcoming usage-price change', message, link: '/settings/billing', isRead: false, createdAt: now }); }
        catch (error) { if (!(error instanceof MongoServerError && error.code === 11000)) throw error; }
        await save(row, { inAppNotifiedAt: now }, runtime);
    }
    if (!row.emailSentAt) {
        const html = `<p>${message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p><p><a href="${env.NEXT_PUBLIC_APP_URL}/settings/billing">Review your billing settings</a></p>`;
        const sent = await (runtime.sendEmail || sendNotificationEmail)({ to: user.email, subject: 'Your upcoming VoSift usage prices', html });
        if (!sent) throw new Error('Usage-price activation waits for a successful billing email.');
        await save(row, { emailSentAt: runtime.now?.() || new Date() }, runtime);
    }
    const noticedAt = new Date(Math.max(row.emailSentAt!.getTime(), row.inAppNotifiedAt!.getTime()));
    const eligible = nextNoticedUsageBoundary(dates.boundary, new Date(noticedAt.getTime() + NOTICE_DAYS * 86400_000), dates.anchorDay);
    // The customer was told "on or after" the proposed renewal. Sending can
    // never shorten the full 30-day notice window.
    await save(row, { noticedAt, effectiveAt: eligible > effective ? eligible : effective, state: 'scheduled' }, runtime);
    await writeSummary(user, owner, row, runtime);
}
async function holdDrafts(row: UsagePriceRollout, runtime: BillingDependencies) {
    for await (const invoice of runtime.stripe.invoices.list({ customer: row.customerId, status: 'draft', limit: 100 })) {
        if (!invoice.auto_advance) continue;
        row.heldInvoices ||= [];
        if (!row.heldInvoices.some(value => value.id === invoice.id)) {
            row.heldInvoices.push({ id: invoice.id, autoAdvance: true });
            await save(row, { heldInvoices: row.heldInvoices }, runtime);
        }
        const previous = row.heldInvoices.find(value => value.id === invoice.id)!;
        if (previous.restoredAt) { previous.restoredAt = undefined; await save(row, { heldInvoices: row.heldInvoices }, runtime); }
        await runtime.stripe.invoices.update(invoice.id, { auto_advance: false, metadata: { vosift_grant_transfer_hold: row._id } });
    }
}
async function restoreDrafts(row: UsagePriceRollout, runtime: BillingDependencies) {
    for (const held of row.heldInvoices || []) {
        if (held.restoredAt) continue;
        const invoice = await runtime.stripe.invoices.retrieve(held.id);
        if (invoice.status === 'draft' && invoice.metadata?.vosift_grant_transfer_hold === row._id) await runtime.stripe.invoices.update(held.id, {
            auto_advance: held.autoAdvance, metadata: { vosift_grant_transfer_hold: '' },
        });
        held.restoredAt = new Date(); await save(row, { heldInvoices: row.heldInvoices }, runtime);
    }
}
async function prepare(user: RolloutUser, owner: string, row: UsagePriceRollout, runtime: RolloutDependencies, now: Date) {
    const collection = await accountCollection(user, runtime);
    const current = await runtime.db.collection<RolloutUser>(collection).findOne({ _id: user._id });
    if (!current || (current.billingGrantTransfer && current.billingGrantTransfer.operationId !== row._id)) throw new Error('Another usage-funding operation must complete first.');
    if (!current.billingGrantTransfer) {
        const held = await runtime.db.collection<RolloutUser>(collection).updateOne({ ...billingFence(user, owner), billingGrantTransfer: { $exists: false } }, { $set: {
            billingGrantTransfer: { operationId: row._id, startedAt: now, reason: 'usage_price_scope_transfer' },
        } });
        if (!held.matchedCount) throw new Error('The usage-funding admission hold could not be acquired.');
    }
    await save(row, { state: 'preparing', preparationStartedAt: row.preparationStartedAt || now }, runtime);
    try {
        await holdDrafts(row, runtime);
        for (const lot of Object.values(getBillingAccount(current).fundingLots)) {
            if (lot.kind !== 'prepaid' || lot.amountMicros - lot.creditedMicros - (lot.revokedMicros || 0) <= 0) continue;
            await prepareGrantTransfer(current, lot, row.targetPriceIds, row._id, runtime);
        }
        await verifyTransferredFunding(current, runtime);
        await restoreDrafts(row, runtime);
    } catch (error) {
        if (!await hasUncertainGrantTransfer(row._id, runtime)) {
            await restoreDrafts(row, runtime);
            if (!(error instanceof GrantTransferFundingPendingError) && !(error instanceof GrantTransferReviewError)) await runtime.db.collection<RolloutUser>(collection).updateOne({ ...billingFence(user, owner), 'billingGrantTransfer.operationId': row._id }, { $unset: { billingGrantTransfer: '' } });
        }
        throw error;
    }
    await save(row, { state: 'prepared', preparedAt: now }, runtime);
    await runtime.db.collection<RolloutUser>(collection).updateOne({ ...billingFence(user, owner), 'billingGrantTransfer.operationId': row._id }, { $unset: { billingGrantTransfer: '' }, $set: { billingUsagePriceRollout: summary(row) } });
}
async function defer(user: RolloutUser, owner: string, row: UsagePriceRollout, runtime: BillingDependencies, now: Date, reason: string) {
    const dates = await boundaryFor(user, runtime), next = nextNoticedUsageBoundary(dates.boundary, new Date(Math.max(now.getTime() + PREPARATION_HOURS * 3600_000 + 1000, row.effectiveAt!.getTime() + 1000)), dates.anchorDay);
    await save(row, { effectiveAt: next, state: row.preparedAt ? 'prepared' : 'scheduled', lastError: reason }, runtime);
    await writeSummary(user, owner, row, runtime);
}
async function apply(user: RolloutUser, owner: string, row: UsagePriceRollout, runtime: BillingDependencies, now: Date) {
    const subscription = await runtime.stripe.subscriptions.retrieve(row.subscriptionId);
    if (stripeObjectId(subscription.customer) !== row.customerId || subscription.status !== 'active' || subscription.billing_mode?.type !== 'flexible'
        || subscription.items.has_more || subscription.pending_update || subscription.schedule || subscription.cancel_at || subscription.cancel_at_period_end) throw new Error('The subscription must be reconciled before changing usage prices.');
    const meters = subscription.items.data.filter(item => item.price.recurring?.usage_type === 'metered');
    const targetIds = pairIds(row.targetTariffs), sourceIds = pairIds(row.sourceTariffs);
    if (meters.length !== 2) throw new Error('Usage-price activation requires exactly two monthly meter items.');
    const alreadyApplied = targetIds.every(id => meters.some(item => item.price.id === id));
    const account = getBillingAccount(user), period = account.currentPeriodId && account.periods[account.currentPeriodId];
    if (!alreadyApplied && (user.billingOperation || Object.keys(account.outbox).length || Object.values(account.reservations).some(value => value.state === 'reserved')
        || await runtime.db.collection(Collections.USAGE_EVENTS).findOne({ authSubject: user.authSubject, value: { $gt: 0 }, processingStatus: { $ne: 'processed' } })
        || (period && period.start >= row.effectiveAt! && (period.storageChargedMicros || period.consumedSeconds || period.chargeablePeakBytes > 0 || Object.values(period.usageAmounts || {}).some(bucket => bucket.quantity > 0))))) {
        await defer(user, owner, row, runtime, now, 'Accepted work or an already-accounted window retains its current tariff.'); return;
    }
    if (!alreadyApplied && (now.getTime() - row.effectiveAt!.getTime() > 15 * 60_000 || meters.some(item => item.current_period_start * 1000 !== row.effectiveAt!.getTime()))) {
        await defer(user, owner, row, runtime, now, 'The exact monthly activation boundary was missed; current usage prices continue.'); return;
    }
    if (!alreadyApplied) {
        if (!sourceIds.every(id => meters.some(item => item.price.id === id))) throw new Error('The subscription prices changed outside the scheduled rollout.');
        await save(row, { state: 'applying', remoteStartedAt: row.remoteStartedAt || now }, runtime);
        const changed = await runtime.stripe.subscriptions.update(subscription.id, { items: [
            { id: meters.find(item => item.price.id === row.sourceTariffs.storage.priceId)!.id, price: row.targetTariffs.storage.priceId },
            { id: meters.find(item => item.price.id === row.sourceTariffs.transcription.priceId)!.id, price: row.targetTariffs.transcription.priceId },
        ], proration_behavior: 'none', billing_cycle_anchor: { type: 'unchanged' }, metadata: { usagePriceRolloutId: row._id } }, { idempotencyKey: `usage-price-activation:${row._id}` });
        if (!targetIds.every(id => changed.items.data.some(item => item.price.id === id))) throw new Error('The new usage meter configuration remains unconfirmed.');
    }
    const values: Partial<RolloutUser> & Record<string, unknown> = { billingUsageTariffs: row.targetTariffs, billingUsageCatalogVersion: row.targetCatalogVersion,
        stripeMetering: { subscriptionId: subscription.id, storagePriceId: row.targetTariffs.storage.priceId, transcriptionPriceId: row.targetTariffs.transcription.priceId, verifiedAt: now } };
    if (user.lifetimeUsageSetup) values['lifetimeUsageSetup.priceIds'] = { storage: row.targetTariffs.storage.priceId, transcription: row.targetTariffs.transcription.priceId };
    if (user.usageBillingBootstrap) values['usageBillingBootstrap.priceIds'] = { storage: row.targetTariffs.storage.priceId, transcription: row.targetTariffs.transcription.priceId };
    const updated = await runtime.db.collection<RolloutUser>(Collections.USERS).updateOne(billingFence(user, owner), { $set: values });
    if (!updated.matchedCount) throw new Error('Remote usage prices changed, but local activation requires reconciliation.');
    await save(row, { state: 'applied', appliedAt: now }, runtime);
    await writeSummary(user, owner, row, runtime);
}
/** Run before storage renewal/admission reconciliation. Every uncertain remote
 * funding step leaves the owned admission hold intact and is resumed later. */
export async function processUsagePriceRollouts(dependencies?: RolloutDependencies, limit = 50) {
    const runtime: RolloutDependencies = dependencies || await billingDependencies(), db = runtime.db;
    const result = { scheduled: 0, notified: 0, prepared: 0, applied: 0, deferred: 0, failed: 0 };
    await reconcileGrantLineages(runtime, limit);
    const pointer = await db.collection<{ _id: string; bundleId?: string; revision: number; publicationOutbox?: { previousBundleId?: string; newBundleId: string } }>('billing_catalog_state').findOne({ _id: 'active' });
    if (pointer?.publicationOutbox) {
        result.scheduled = await scheduleCatalogUsageRollouts(pointer.publicationOutbox.previousBundleId, pointer.publicationOutbox.newBundleId, runtime, `${pointer.publicationOutbox.newBundleId}:revision:${pointer.revision}`);
        await db.collection<{ _id: string; revision: number }>('billing_catalog_state').updateOne({ _id: 'active', revision: pointer.revision, 'publicationOutbox.newBundleId': pointer.publicationOutbox.newBundleId }, { $unset: { publicationOutbox: '' } });
    }
    else if (pointer?.bundleId) result.scheduled = await scheduleCatalogUsageRollouts(undefined, pointer.bundleId, runtime, `${pointer.bundleId}:revision:${pointer.revision}`);
    const jobs = await db.collection<UsagePriceRollout>(USAGE_PRICE_ROLLOUTS).find({ state: { $nin: ['applied', 'canceled'] } }).sort({ checkedAt: 1 }).limit(limit).toArray();
    for (const row of jobs) {
        const now = runtime.now?.() || new Date();
        try {
            await save(row, { checkedAt: now }, runtime);
            await withBillingLease(db, row.authSubject, async (value, owner) => {
                const user = value as RolloutUser;
                const latest = await db.collection<UsagePriceRollout>(USAGE_PRICE_ROLLOUTS).findOne({ _id: row._id });
                if (!latest || ['applied', 'canceled'].includes(latest.state)) return;
                Object.assign(row, latest);
                if (user.stripeCustomerId !== row.customerId || (user.stripeCustomerGeneration || 0) !== row.generation || user.stripeSubscriptionId !== row.subscriptionId) throw new GrantTransferReviewError('The scheduled usage-price customer identity changed.');
                if (user.disabled || user.softDelete?.isDeleted) {
                    // Erasure cancels pricing changes, never their financial
                    // asset transfer or the restoration of held invoices.
                    if (row.state === 'preparing' || user.billingGrantTransfer?.operationId === row._id) await prepare(user, owner, row, runtime, now);
                    else await restoreDrafts(row, runtime);
                    await save(row, { state: 'canceled' }, runtime); await writeSummary(user, owner, row, runtime); return;
                }
                if (hasBlockingBillingReview(user.billingReview) || hasBlockingFinancialReview(user.billingAccount)) throw new Error('Resolve financial review before changing usage prices.');
                if (row.scheduleCoordinator) {
                    if (row.state === 'notifying') { await notify(user, owner, row, runtime, now); result.notified++; return; }
                    if (!row.effectiveAt || !row.noticedAt || row.effectiveAt.getTime() - row.noticedAt.getTime() < NOTICE_DAYS * 86400_000) {
                        throw new GrantTransferReviewError('The usage-price change requires a complete successful notice period.');
                    }
                    if (row.state === 'needs_review') return;
                    if (now >= row.effectiveAt) {
                        if (!row.preparedAt && !user.billingSchedule) {
                            await defer(user, owner, row, runtime, now, 'The Stripe schedule was not prepared before its boundary.'); result.deferred++; return;
                        }
                        await syncOwnedBillingScheduleBoundary(user, owner, runtime, now);
                        const refreshed = await db.collection<UsagePriceRollout>(USAGE_PRICE_ROLLOUTS).findOne({ _id: row._id });
                        if (refreshed?.state === 'applied') { Object.assign(row, refreshed); result.applied++; return; }
                        throw new BillingSyncPendingError();
                    }
                    try { await assertPrepaidGrantsCoverTarget(user, { storage: row.targetTariffs.storage.priceId, transcription: row.targetTariffs.transcription.priceId }, runtime.stripe, runtime.db); }
                    catch (error) { await defer(user, owner, row, runtime, now, error instanceof Error ? error.message : 'Legacy prepaid scope requires reconciliation.'); result.deferred++; return; }
                    await coordinateBillingSchedule(user, owner, runtime, now);
                    await save(row, { state: 'prepared', preparedAt: row.preparedAt || now }, runtime); result.prepared++; return;
                }
                if (row.state !== 'applying' && user.billingUsageTariffs && !samePair(user.billingUsageTariffs, row.sourceTariffs)) {
                    if (row.state === 'preparing' || user.billingGrantTransfer?.operationId === row._id) await prepare(user, owner, row, runtime, now);
                    await save(row, { state: 'canceled', lastError: 'An explicitly chosen plan supplied different usage terms.' }, runtime);
                    await writeSummary(user, owner, row, runtime); return;
                }
                if (row.state === 'notifying') { await notify(user, owner, row, runtime, now); result.notified++; return; }
                if (!row.effectiveAt || !row.noticedAt) throw new GrantTransferReviewError('A usage-price change has no successful 30-day notice.');
                if (row.state === 'needs_review') return;
                if (!row.preparedAt && row.state !== 'preparing' && now.getTime() >= row.effectiveAt.getTime() - PREPARATION_HOURS * 3600_000) {
                    await defer(user, owner, row, runtime, now, 'Preparation missed its 24-hour lead; current usage prices continue.'); result.deferred++; return;
                }
                if (row.state === 'scheduled' || row.state === 'preparing') { await prepare(user, owner, row, runtime, now); result.prepared++; return; }
                if (now >= row.effectiveAt) { await apply(user, owner, row, runtime, now); if (row.state === 'applied') result.applied++; else result.deferred++; }
            });
        } catch (error) {
            result.failed++;
            await save(row, { ...(error instanceof GrantTransferReviewError ? { state: 'needs_review' } : {}), lastError: error instanceof Error ? error.message : 'Usage-price change remains unconfirmed.' }, runtime);
        }
    }
    return result;
}
export async function usageGrantTransferRecords(subject: string, runtime: BillingDependencies) {
    return runtime.db.collection<GrantTransfer>('billing_grant_transfers').find({ authSubject: subject }).toArray();
}
