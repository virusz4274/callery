import 'server-only';
import { createHash } from 'node:crypto';
import { MongoServerError, type Db } from 'mongodb';
import type Stripe from 'stripe';
import type { User } from '@/lib/db/types';
import { Collections } from '@/lib/mongodb';
import { billingDependencies, type BillingDependencies } from './runtime';
import { getBillingAccount, getPrepaidState, ledgerKey, revokePrepaidFunds, type FundingLot } from './ledger';
import { stripeObjectId } from './objects';
import { invoiceLinePriceId } from './objects';
import { completeInvoiceLines } from './invoice-funding';

export const GRANT_TRANSFERS = 'billing_grant_transfers';
export interface GrantTransfer {
    _id: string; operationId: string; authSubject: string; customerId: string; generation: number;
    originalLotId: string; originalGrantId: string; fromGrantId: string; replacementGrantId?: string;
    targetPriceIds: string[]; sourceAmountMinor: number; replacementAmountMinor?: number;
    state: 'planned' | 'expiring' | 'expired' | 'creating' | 'ready' | 'needs_review';
    createdAt: Date; updatedAt: Date; expiryRequestedAt?: Date; expiredAt?: Date; replacementStartedAt?: Date;
    earliestOwedPeriodEnd?: Date;
    proofTransactionIds?: string[]; expiredTransactionIds?: string[]; lastError?: string;
}
export class GrantTransferPendingError extends Error {}
export class GrantTransferFundingPendingError extends GrantTransferPendingError {}
export class GrantTransferReviewError extends Error {}
interface GrantScopeOperation { _id: string; authSubject: string; customerId: string; generation: number; targetPriceIds: string[];
    state: 'preparing' | 'ready' | 'needs_review'; createdAt: Date; updatedAt: Date; heldInvoices: { id: string; autoAdvance: boolean; restoredAt?: Date }[]; lastError?: string }
export const GRANT_SCOPE_OPERATIONS = 'billing_grant_scope_operations';
export async function hasUncertainGrantTransfer(operationId: string, runtime: BillingDependencies) {
    return Boolean(await runtime.db.collection<GrantTransfer>(GRANT_TRANSFERS).findOne({ operationId, expiryRequestedAt: { $exists: true }, state: { $ne: 'ready' } }));
}
function sorted(ids: string[]) { return [...new Set(ids)].sort(); }
function idHash(value: string) { return createHash('sha256').update(value).digest('hex'); }
function monetary(amount: { monetary?: { currency: string; value: number } | null }): number {
    const value = amount.monetary;
    if (!value || value.currency !== 'usd' || !Number.isSafeInteger(value.value) || value.value < 0) throw new GrantTransferReviewError('A usage-credit transaction has an unsupported amount.');
    return value.value;
}
export async function readGrantTransactions(stripe: Stripe, customerId: string, grantId: string) {
    let creditMinor = 0, appliedMinor = 0, expiredMinor = 0, voidedMinor = 0;
    const transactionIds: string[] = [], expiredIds: string[] = [], invoiceVoids: string[] = [];
    for await (const row of stripe.billing.creditBalanceTransactions.list({ customer: customerId, credit_grant: grantId, limit: 100 })) {
        if (stripeObjectId(row.credit_grant) !== grantId) throw new GrantTransferReviewError('Credit-grant transaction ownership changed.');
        transactionIds.push(row.id);
        if (row.type === 'credit' && row.credit) {
            if (!['credits_granted', 'credits_application_invoice_voided'].includes(row.credit.type)) throw new GrantTransferReviewError('An unknown usage-credit adjustment needs review.');
            creditMinor += monetary(row.credit.amount);
            if (row.credit.type === 'credits_application_invoice_voided') invoiceVoids.push(row.id);
        } else if (row.type === 'debit' && row.debit) {
            const amount = monetary(row.debit.amount);
            if (row.debit.type === 'credits_applied') appliedMinor += amount;
            else if (row.debit.type === 'credits_expired') { expiredMinor += amount; expiredIds.push(row.id); }
            else if (row.debit.type === 'credits_voided') voidedMinor += amount;
            else throw new GrantTransferReviewError('An unknown usage-credit debit needs review.');
        } else throw new GrantTransferReviewError('A usage-credit transaction has no financial direction.');
    }
    const remainingMinor = creditMinor - appliedMinor - expiredMinor - voidedMinor;
    if (![creditMinor, appliedMinor, expiredMinor, voidedMinor, remainingMinor].every(value => Number.isSafeInteger(value) && value >= 0)) throw new GrantTransferReviewError('Usage-credit balances do not reconcile.');
    return { creditMinor, appliedMinor, expiredMinor, voidedMinor, remainingMinor,
        transactionIds: sorted(transactionIds), expiredIds: sorted(expiredIds), invoiceVoids };
}
async function chain(grantId: string, db: Db): Promise<GrantTransfer[]> {
    const result: GrantTransfer[] = [], seen = new Set<string>();
    let current = grantId;
    for (let depth = 0; depth < 100; depth++) {
        if (seen.has(current)) throw new GrantTransferReviewError('A credit-grant lineage contains a cycle.');
        seen.add(current);
        const next = await db.collection<GrantTransfer>(GRANT_TRANSFERS).find({ fromGrantId: current, state: { $ne: 'needs_review' } }).toArray();
        if (next.length > 1) throw new GrantTransferReviewError('A credit-grant lineage contains conflicting transfers.');
        if (!next.length) return result;
        result.push(next[0]);
        if (next[0].state !== 'ready') throw new GrantTransferPendingError('Usage funding is being prepared for the new prices.');
        if (!next[0].replacementGrantId) return result;
        current = next[0].replacementGrantId;
    }
    throw new GrantTransferReviewError('Usage-credit lineage requires archival review.');
}
export async function resolveGrantLineage(grantId: string, runtime: BillingDependencies) {
    const records = await chain(grantId, runtime.db);
    const last = records.at(-1);
    return { records, grantId: last ? last.replacementGrantId : grantId };
}
/** Original principal and fees stay on their original lot; only the remote binding changes. */
export async function activeGrantIdsForUser(user: User, runtime: BillingDependencies): Promise<string[]> {
    const ids: string[] = [];
    for (const lot of Object.values(getBillingAccount(user).fundingLots)) {
        if (lot.kind !== 'prepaid' || lot.amountMicros - (lot.spentMicros || 0) - (lot.revokedMicros || 0) - lot.creditedMicros <= 0) continue;
        const resolved = await resolveGrantLineage(lot.reference, runtime);
        if (resolved.records.some(row => row.authSubject !== user.authSubject || row.customerId !== user.stripeCustomerId)) throw new GrantTransferReviewError('Usage-credit transfer ownership changed.');
        if (resolved.grantId) ids.push(resolved.grantId);
    }
    return sorted(ids);
}
/** Include already-earned usage that Stripe has not invoiced yet. It is no
 * longer locally spendable, but its original invoice still needs grant funds. */
export async function verifyTransferredFunding(user: User, runtime: BillingDependencies) {
    const account = getBillingAccount(user), balance = getPrepaidState(user), ids = new Set<string>();
    for (const lot of Object.values(account.fundingLots)) if (lot.kind === 'prepaid') {
        const leaf = await resolveGrantLineage(lot.reference, runtime);
        if (leaf.grantId) ids.add(leaf.grantId);
    }
    let remoteMicros = 0;
    for (const id of ids) remoteMicros += (await readGrantTransactions(runtime.stripe, user.stripeCustomerId!, id)).remainingMinor * 10_000;
    const uninvoiced = Object.values(account.periods).reduce((total, period) => total + Object.values(period.usageAmounts || {}).reduce((sum, bucket) => sum + Math.max(0, bucket.grossEarnedMicros - bucket.invoicedGrossMicros), 0), 0);
    if (remoteMicros < balance.availableMicros + balance.reservedMicros + uninvoiced) throw new GrantTransferFundingPendingError('Transferred grants do not yet cover spendable, reserved and earned uninvoiced usage. Reconcile invoice debits before releasing the hold.');
    return { remoteMicros, uninvoicedMicros: uninvoiced };
}
function checkGrant(grant: Stripe.Billing.CreditGrant, customerId: string, amountMinor?: number) {
    if (stripeObjectId(grant.customer) !== customerId || grant.category !== 'paid' || grant.amount.monetary?.currency !== 'usd'
        || !Number.isSafeInteger(grant.amount.monetary.value) || (amountMinor !== undefined && grant.amount.monetary.value !== amountMinor)) throw new GrantTransferReviewError('Usage-credit grant identity or amount changed.');
}
/** Caller owns the account lease and its admission hold before invoking this operation. */
export async function prepareGrantTransfer(user: User, lot: FundingLot, targetPriceIds: string[], operationId: string, runtime: BillingDependencies): Promise<GrantTransfer | undefined> {
    const { db, stripe } = runtime;
    const leaseOwner = user.stripeBillingLease?.owner;
    if (!user.stripeCustomerId || lot.kind !== 'prepaid' || !leaseOwner) throw new GrantTransferReviewError('Verified prepaid ownership and an owned billing lease are required.');
    for (const pending of await db.collection<GrantTransfer>(GRANT_TRANSFERS).find({ originalGrantId: lot.reference, state: { $ne: 'ready' } }).toArray()) {
        if (pending.authSubject !== user.authSubject || pending.customerId !== user.stripeCustomerId) throw new GrantTransferReviewError('Usage-credit transfer ownership changed.');
        await resumeGrantTransfer(pending, runtime, leaseOwner);
    }
    const resolved = await resolveGrantLineage(lot.reference, runtime);
    if (!resolved.grantId) return;
    const fromGrantId = resolved.grantId, target = sorted(targetPriceIds);
    if (!target.length || target.some(id => !id)) throw new GrantTransferReviewError('Usage-credit scope is incomplete.');
    const grant = await stripe.billing.creditGrants.retrieve(fromGrantId);
    checkGrant(grant, user.stripeCustomerId);
    const existingScope = grant.applicability_config.scope;
    if (existingScope.price_type || !existingScope.prices?.length) throw new GrantTransferReviewError('Usage-credit scope requires explicit prices.');
    const required = sorted([...target, ...existingScope.prices.map(price => price.id || '')]);
    if (required.some(id => !id)) throw new GrantTransferReviewError('An existing usage-credit scope is invalid.');
    if (!grant.voided_at && !grant.expires_at && required.every(id => existingScope.prices!.some(price => price.id === id))) return;
    const key = idHash(`${user.authSubject}:${fromGrantId}:${JSON.stringify(required)}`), records = db.collection<GrantTransfer>(GRANT_TRANSFERS);
    let transfer = await records.findOne({ _id: key });
    if (!transfer) {
        if (grant.voided_at || grant.expires_at) throw new GrantTransferReviewError('Unexpected expired usage credit cannot be reissued.');
        const periodEnds: number[] = [];
        const account = getBillingAccount(user), current = account.currentPeriodId && account.periods[account.currentPeriodId];
        if (current && current.end.getTime() > Date.now()) periodEnds.push(current.end.getTime());
        for (const event of Object.values(account.outbox)) periodEnds.push(event.periodEnd.getTime());
        for (const reservation of Object.values(account.reservations)) if (reservation.state === 'reserved' && reservation.periodId) {
            const originalPeriod = account.periods[reservation.periodId];
            if (!originalPeriod) throw new GrantTransferPendingError('Accepted work needs its original usage window before credit can move.');
            periodEnds.push(originalPeriod.end.getTime());
        }
        for await (const event of db.collection<{ periodEnd?: Date }>(Collections.USAGE_EVENTS).find({ authSubject: user.authSubject, customerId: user.stripeCustomerId, state: { $ne: 'billed' }, value: { $gt: 0 } })) {
            if (!event.periodEnd) throw new GrantTransferPendingError('Uninvoiced usage needs its original service period before credit can move.');
            periodEnds.push(event.periodEnd.getTime());
        }
        for await (const invoice of stripe.invoices.list({ customer: user.stripeCustomerId, status: 'draft', limit: 100 })) {
            const lines = await completeInvoiceLines(stripe, invoice);
            if (lines.some(line => existingScope.prices!.some(price => price.id === invoiceLinePriceId(line)) && (line.amount > 0 || (line.quantity || 0) > 0))) periodEnds.push(invoice.period_end * 1000);
        }
        if (periodEnds.some(value => value <= Date.now() + 60_000)) throw new GrantTransferPendingError('An earlier usage invoice must finalize before its credit can move.');
        const earliestOwedPeriodEnd = periodEnds.length ? new Date(Math.min(...periodEnds)) : undefined;
        transfer = { _id: key, operationId, authSubject: user.authSubject, customerId: user.stripeCustomerId,
            generation: user.stripeCustomerGeneration || 0, originalLotId: lot.id, originalGrantId: lot.reference, fromGrantId,
            targetPriceIds: required, sourceAmountMinor: grant.amount.monetary!.value, earliestOwedPeriodEnd, state: 'planned', createdAt: new Date(), updatedAt: new Date() };
        try { await records.insertOne(transfer); }
        catch (error) { if (!(error instanceof MongoServerError && error.code === 11000)) throw error; transfer = await records.findOne({ _id: key }); }
    }
    if (!transfer || transfer.customerId !== user.stripeCustomerId || transfer.generation !== (user.stripeCustomerGeneration || 0)) throw new GrantTransferReviewError('The usage-credit customer generation changed.');
    return resumeGrantTransfer(transfer, runtime, leaseOwner);
}
async function assertTransferLease(transfer: GrantTransfer, leaseOwner: string, runtime: BillingDependencies) {
    const identity = { authSubject: transfer.authSubject, stripeCustomerId: transfer.customerId, 'stripeBillingLease.owner': leaseOwner,
        'stripeBillingLease.until': { $gt: new Date() }, 'billingGrantTransfer.operationId': transfer.operationId };
    const user = await runtime.db.collection<User>(Collections.USERS).findOne(identity) || await runtime.db.collection<User>('billing_deleted_accounts').findOne(identity);
    const lot = user && Object.values(getBillingAccount(user).fundingLots).find(value => value.id === transfer.originalLotId);
    if (!user || (user.stripeCustomerGeneration || 0) !== transfer.generation) throw new GrantTransferPendingError('The usage-credit lease or customer generation changed; its owned hold remains for reconciliation.');
    if (!lot || (lot.revokedMicros || 0) > 0 || user.billingReview) throw new GrantTransferReviewError('The original prepaid principal is no longer verified for a grant replacement.');
}
async function resumeGrantTransfer(transfer: GrantTransfer, runtime: BillingDependencies, leaseOwner: string): Promise<GrantTransfer> {
    const { db, stripe } = runtime, records = db.collection<GrantTransfer>(GRANT_TRANSFERS);
    const save = async (patch: Partial<GrantTransfer>) => { Object.assign(transfer, patch, { updatedAt: new Date() }); await records.updateOne({ _id: transfer._id }, { $set: { ...patch, updatedAt: transfer.updatedAt } }); };
    try {
        if (transfer.state === 'needs_review') throw new GrantTransferReviewError(transfer.lastError || 'Usage-credit transfer needs review.');
        if (transfer.state === 'ready') return transfer;
        let grant = await stripe.billing.creditGrants.retrieve(transfer.fromGrantId);
        checkGrant(grant, transfer.customerId, transfer.sourceAmountMinor);
        if (grant.voided_at) throw new GrantTransferReviewError('Voided credit cannot be transferred.');
        if (transfer.state === 'planned') {
            const before = await readGrantTransactions(stripe, transfer.customerId, grant.id);
            if (grant.expires_at || before.invoiceVoids.length || before.voidedMinor || before.creditMinor !== transfer.sourceAmountMinor) throw new GrantTransferReviewError('Usage-credit provenance requires reconciliation before transfer.');
            await save({ state: 'expiring', expiryRequestedAt: new Date() });
        }
        if (transfer.state === 'expiring') {
            if (!grant.expires_at) { await assertTransferLease(transfer, leaseOwner, runtime); grant = await stripe.billing.creditGrants.expire(grant.id, {}, { idempotencyKey: `usage-grant-expire:${transfer._id}` }); }
            if (!grant.expires_at || grant.expires_at > Date.now() / 1000) throw new GrantTransferPendingError('Waiting for confirmed usage-credit expiry.');
            const proof = await readGrantTransactions(stripe, transfer.customerId, grant.id);
            if (proof.invoiceVoids.length || proof.voidedMinor || proof.creditMinor !== transfer.sourceAmountMinor) throw new GrantTransferReviewError('Usage-credit changes need financial review.');
            if (proof.remainingMinor || (proof.expiredMinor > 0 && !proof.expiredIds.length)) throw new GrantTransferPendingError('Waiting for the exact expired-credit debit.');
            // Remote remaining credit includes earned-but-uninvoiced usage. Its
            // union replacement must cover those original prices too.
            await save({ state: 'expired', expiredAt: new Date(), replacementAmountMinor: proof.expiredMinor,
                proofTransactionIds: proof.transactionIds, expiredTransactionIds: proof.expiredIds });
        }
        if (transfer.state === 'expired' && !transfer.replacementAmountMinor) { await save({ state: 'ready' }); return transfer; }
        if (transfer.state === 'expired') await save({ state: 'creating', replacementStartedAt: new Date() });
        if (transfer.state === 'creating') {
            let replacement: Stripe.Billing.CreditGrant | undefined;
            for await (const candidate of stripe.billing.creditGrants.list({ customer: transfer.customerId, limit: 100 })) {
                if (candidate.metadata?.usageGrantTransferId !== transfer._id) continue;
                if (replacement) throw new GrantTransferReviewError('Duplicate usage-credit replacements need review.');
                replacement = candidate;
            }
            if (!replacement) {
                await assertTransferLease(transfer, leaseOwner, runtime);
                if (transfer.earliestOwedPeriodEnd && transfer.earliestOwedPeriodEnd.getTime() <= Date.now() + 1000) throw new GrantTransferReviewError('Expired usage credit crossed its original invoice eligibility date; financial repair is required.');
                if (Date.now() - transfer.replacementStartedAt!.getTime() >= 23 * 3600_000) throw new GrantTransferReviewError('The older usage-credit create result is uncertain.');
                replacement = await stripe.billing.creditGrants.create({ customer: transfer.customerId, category: 'paid',
                    amount: { type: 'monetary', monetary: { currency: 'usd', value: transfer.replacementAmountMinor! } },
                    applicability_config: { scope: { prices: transfer.targetPriceIds.map(id => ({ id })) } },
                    metadata: { usageGrantTransferId: transfer._id, authSubject: transfer.authSubject, originalGrantId: transfer.originalGrantId, fromGrantId: transfer.fromGrantId },
                    name: 'VoSift carried prepaid usage credit' }, { idempotencyKey: `usage-grant-replacement:${transfer._id}` });
            }
            checkGrant(replacement, transfer.customerId, transfer.replacementAmountMinor);
            if (transfer.earliestOwedPeriodEnd && (replacement.effective_at || replacement.created) * 1000 > transfer.earliestOwedPeriodEnd.getTime()) throw new GrantTransferReviewError('Replacement credit is not eligible for the original uninvoiced service period.');
            if (replacement.expires_at || replacement.voided_at || replacement.applicability_config.scope.price_type
                || JSON.stringify(sorted(replacement.applicability_config.scope.prices?.map(price => price.id || '') || [])) !== JSON.stringify(transfer.targetPriceIds)) throw new GrantTransferReviewError('Replacement usage-credit scope differs from its exact proof.');
            await save({ state: 'ready', replacementGrantId: replacement.id });
        }
        return transfer;
    } catch (error) {
        await save({ ...(error instanceof GrantTransferReviewError ? { state: 'needs_review' } : {}), lastError: error instanceof Error ? error.message : 'Usage-credit transfer remains uncertain.' });
        throw error;
    }
}
export async function grantLineageIds(originalGrantId: string, runtime: BillingDependencies): Promise<string[]> {
    const rows = await runtime.db.collection<GrantTransfer>(GRANT_TRANSFERS).find({ originalGrantId }).toArray();
    return sorted([originalGrantId, ...rows.flatMap(row => [row.fromGrantId, row.replacementGrantId || ''])].filter(Boolean));
}
export async function originalGrantForDescendant(grantId: string, runtime: BillingDependencies) {
    const row = await runtime.db.collection<GrantTransfer>(GRANT_TRANSFERS).findOne({ replacementGrantId: grantId });
    return row ? { originalGrantId: row.originalGrantId, originalLotId: row.originalLotId, authSubject: row.authSubject, customerId: row.customerId } : undefined;
}
/** Shared by explicitly requested immediate plan changes. Caller must already
 * own withBillingLease; response loss keeps a durable, recoverable account hold. */
export async function ensureUsageGrantScope(user: User, targetPriceIds: string[], runtime: BillingDependencies): Promise<void> {
    const { db, stripe } = runtime, owner = user.stripeBillingLease?.owner;
    if (!owner || !user.stripeCustomerId) throw new GrantTransferReviewError('An owned billing lease is required before moving prepaid credit.');
    const target = sorted(targetPriceIds), id = idHash(`usage-grant-scope:${user.authSubject}:${user.stripeCustomerId}:${JSON.stringify(target)}`);
    const operations = db.collection<GrantScopeOperation>(GRANT_SCOPE_OPERATIONS);
    let operation = await operations.findOne({ _id: id });
    if (!operation) {
        operation = { _id: id, authSubject: user.authSubject, customerId: user.stripeCustomerId, generation: user.stripeCustomerGeneration || 0,
            targetPriceIds: target, state: 'preparing', createdAt: new Date(), updatedAt: new Date(), heldInvoices: [] };
        try { await operations.insertOne(operation); }
        catch (error) { if (!(error instanceof MongoServerError && error.code === 11000)) throw error; operation = await operations.findOne({ _id: id }); }
    }
    if (!operation || operation.state === 'needs_review') throw new GrantTransferReviewError('Prepaid scope preparation requires financial review.');
    const gate = { _id: user._id, stripeCustomerId: user.stripeCustomerId, 'stripeBillingLease.owner': owner, 'stripeBillingLease.until': { $gt: new Date() } };
    const collection = await db.collection<User>(Collections.USERS).findOne({ _id: user._id }) ? Collections.USERS : 'billing_deleted_accounts';
    const current = await db.collection<User>(collection).findOne(gate);
    if (!current || (current.billingGrantTransfer && current.billingGrantTransfer.operationId !== id)) throw new GrantTransferPendingError('Another usage-funding operation must finish first.');
    await db.collection<User>(collection).updateOne(gate, { $set: { billingGrantTransfer: { operationId: id, startedAt: new Date(), reason: 'plan_usage_scope_transfer' } } });
    const saveOperation = async () => { operation!.updatedAt = new Date(); await operations.updateOne({ _id: id }, { $set: Object.fromEntries(Object.entries(operation!).filter(([key]) => key !== '_id')) }); };
    const restore = async () => {
        for (const held of operation!.heldInvoices) {
            if (held.restoredAt) continue;
            const invoice = await stripe.invoices.retrieve(held.id);
            if (invoice.status === 'draft' && invoice.metadata?.vosift_grant_transfer_hold === id) await stripe.invoices.update(held.id, { auto_advance: held.autoAdvance, metadata: { vosift_grant_transfer_hold: '' } });
            held.restoredAt = new Date(); await saveOperation();
        }
    };
    try {
        for await (const invoice of stripe.invoices.list({ customer: user.stripeCustomerId, status: 'draft', limit: 100 })) {
            if (!invoice.auto_advance) continue;
            const prior = operation.heldInvoices.find(value => value.id === invoice.id);
            if (!prior) operation.heldInvoices.push({ id: invoice.id, autoAdvance: true }); else prior.restoredAt = undefined;
            await saveOperation();
            await stripe.invoices.update(invoice.id, { auto_advance: false, metadata: { vosift_grant_transfer_hold: id } });
        }
        for (const lot of Object.values(getBillingAccount(current).fundingLots)) if (lot.kind === 'prepaid' && lot.amountMicros - lot.creditedMicros - (lot.revokedMicros || 0) > 0) await prepareGrantTransfer(current, lot, target, id, runtime);
        await verifyTransferredFunding(current, runtime);
        await restore();
        operation.state = 'ready'; await saveOperation();
        await db.collection<User>(collection).updateOne({ ...gate, 'billingGrantTransfer.operationId': id }, { $unset: { billingGrantTransfer: '' } });
    } catch (error) {
        if (!await hasUncertainGrantTransfer(id, runtime)) {
            await restore();
            if (!(error instanceof GrantTransferFundingPendingError) && !(error instanceof GrantTransferReviewError)) await db.collection<User>(collection).updateOne({ ...gate, 'billingGrantTransfer.operationId': id }, { $unset: { billingGrantTransfer: '' } });
        }
        operation.lastError = error instanceof Error ? error.message : 'The grant scope remains uncertain.';
        if (error instanceof GrantTransferReviewError) operation.state = 'needs_review';
        await saveOperation();
        throw error;
    }
}
export async function reconcileUsageGrantScopes(dependencies?: BillingDependencies, limit = 50) {
    const runtime = await billingDependencies(dependencies), jobs = await runtime.db.collection<GrantScopeOperation>(GRANT_SCOPE_OPERATIONS).find({ state: 'preparing' }).sort({ updatedAt: 1 }).limit(limit).toArray();
    // Import lazily: billing-lock also serves settlement, which reads grants.
    const { withBillingLease } = await import('./billing-lock');
    let resumed = 0;
    for (const operation of jobs) try {
        await withBillingLease(runtime.db, operation.authSubject, async user => {
            if (user.stripeCustomerId !== operation.customerId || (user.stripeCustomerGeneration || 0) !== operation.generation) throw new GrantTransferReviewError('Usage-credit scope customer generation changed.');
            await ensureUsageGrantScope(user, operation.targetPriceIds, runtime); resumed++;
        });
    } catch { /* Durable owned holds remain until financial recovery succeeds. */ }
    return resumed;
}
/** Planned expiry is not a cash reversal. Late ancestor adjustments, however,
 * cannot create a second spendable grant after the original balance moved. */
export async function handlePlannedGrantExpiry(grantId: string, dependencies: BillingDependencies): Promise<boolean> {
    const runtime = await billingDependencies(dependencies), { db, stripe } = runtime;
    const transfer = await db.collection<GrantTransfer>(GRANT_TRANSFERS).findOne({ fromGrantId: grantId });
    if (!transfer) return false;
    if (['planned', 'expiring', 'expired', 'creating'].includes(transfer.state)) return true;
    if (transfer.state === 'needs_review') return true;
    const proof = await readGrantTransactions(stripe, transfer.customerId, grantId);
    if (JSON.stringify(proof.transactionIds) === JSON.stringify(transfer.proofTransactionIds)) return true;
    const { withBillingLease } = await import('./billing-lock');
    await withBillingLease(db, transfer.authSubject, async user => {
        if (!Object.values(getBillingAccount(user).fundingLots).some(lot => lot.id === transfer.originalLotId)) throw new GrantTransferReviewError('The original grant principal needs tombstone reconciliation.');
        await suspendGrantLineage(user, transfer.originalGrantId, `ancestor-adjustment:${grantId}`, runtime);
    });
    return true;
}
/** Invoice voids can reinstate an ancestor long after its replacement. Poll
 * the financial transaction proof as well as accepting grant-update webhooks. */
export async function reconcileGrantLineages(dependencies?: BillingDependencies, limit = 50) {
    const runtime = await billingDependencies(dependencies);
    const rows = await runtime.db.collection<GrantTransfer>(GRANT_TRANSFERS).find({ state: 'ready' }).sort({ updatedAt: 1 }).limit(limit).toArray();
    let checked = 0;
    for (const row of rows) try {
        await handlePlannedGrantExpiry(row.fromGrantId, runtime);
        await runtime.db.collection<GrantTransfer>(GRANT_TRANSFERS).updateOne({ _id: row._id }, { $set: { updatedAt: new Date() }, $unset: { lastError: '' } });
        checked++;
    } catch (error) {
        // A busy or unavailable customer must not prevent reconciliation of
        // unrelated accounts. Keep the durable source proof for the next pass.
        await runtime.db.collection<GrantTransfer>(GRANT_TRANSFERS).updateOne({ _id: row._id }, { $set: { updatedAt: new Date(), lastError: error instanceof Error ? error.message : 'The grant lineage requires another reconciliation pass.' } });
    }
    return checked;
}
export async function suspendGrantLineage(user: User, originalGrantId: string, receiptId: string, runtime: BillingDependencies) {
    const { db, stripe } = runtime;
    const owner = user.stripeBillingLease?.owner;
    const assertOwned = async () => {
        if (!owner) throw new GrantTransferReviewError('Credit suspension requires the owned account billing lease.');
        const identity = { _id: user._id, authSubject: user.authSubject, stripeCustomerId: user.stripeCustomerId, 'stripeBillingLease.owner': owner, 'stripeBillingLease.until': { $gt: new Date() } };
        const current = await db.collection<User>(Collections.USERS).findOne(identity) || await db.collection<User>('billing_deleted_accounts').findOne(identity);
        if (!current || (current.stripeCustomerGeneration || 0) !== (user.stripeCustomerGeneration || 0)) throw new GrantTransferReviewError('The credit-suspension account lease or customer generation changed.');
    };
    await assertOwned();
    const ids = new Set(await grantLineageIds(originalGrantId, runtime));
    const transfers = await db.collection<GrantTransfer>(GRANT_TRANSFERS).find({ originalGrantId, authSubject: user.authSubject, customerId: user.stripeCustomerId }).toArray();
    const transferIds = new Set(transfers.map(row => row._id));
    // A successful create can lose its response before replacementGrantId is
    // persisted. Cash reversal must also expire that remotely discoverable
    // descendant rather than waiting for the normal transfer retry.
    for await (const candidate of stripe.billing.creditGrants.list({ customer: user.stripeCustomerId!, limit: 100 })) {
        if (candidate.metadata?.originalGrantId === originalGrantId || transferIds.has(candidate.metadata?.usageGrantTransferId || '')) ids.add(candidate.id);
    }
    for (const id of ids) {
        const grant = await stripe.billing.creditGrants.retrieve(id);
        if (stripeObjectId(grant.customer) !== user.stripeCustomerId) throw new GrantTransferReviewError('A suspended grant belongs to another customer.');
        if (!grant.voided_at && (!grant.expires_at || grant.expires_at > Date.now() / 1000)) {
            await assertOwned();
            await stripe.billing.creditGrants.expire(id, {}, { idempotencyKey: `lineage-revoke:${ledgerKey(`${receiptId}:${id}`)}` });
        }
    }
    await assertOwned();
    const originalLot = Object.values(getBillingAccount(user).fundingLots).find(lot => lot.kind === 'prepaid' && lot.reference === originalGrantId);
    await revokePrepaidFunds(user.authSubject, originalLot?.id || `stripe-credit-grant:${originalGrantId}`, receiptId, db);
    for (const collection of [Collections.USERS, 'billing_deleted_accounts']) await db.collection<User>(collection).updateOne({ _id: user._id, authSubject: user.authSubject, 'stripeBillingLease.owner': owner }, { $set: {
        billingReview: { reason: 'prepaid_grant_lineage_adjustment', createdAt: new Date() }, 'automaticTopup.enabled': false,
    } });
}
