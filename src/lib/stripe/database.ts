import type { Db } from 'mongodb';
import type { InitializationIndexGroup } from '@/lib/db/index-definitions';

/** One manifest is shared by runtime constraints and read-only db:init inspection. */
export const BILLING_INDEX_GROUPS: InitializationIndexGroup[] = [
    { collection: 'billing_deleted_accounts', indexes: [
        { key: { authSubject: 1 }, unique: true }, { key: { stripeCustomerId: 1 } },
    ] },
    { collection: 'billing_credit_note_reviews', indexes: [{ key: { authSubject: 1, state: 1 } }, { key: { customerId: 1, invoiceId: 1 } }] },
    { collection: 'billing_settlements', indexes: [{ key: { state: 1, nextCheckAt: 1, updatedAt: 1 } }, { key: { state: 1, settledAt: 1 } }] },
    { collection: 'billing_catalog_bundles', indexes: [{ key: { state: 1, createdAt: -1 } }] },
    { collection: 'billing_catalog_versions', indexes: [
        { key: { bundleId: 1, 'plan.stripePriceId': 1 } },
        { key: { 'plan.stripePriceId': 1, publishedAt: -1, _id: -1 } },
        { key: { 'usageTariffs.storage.priceId': 1 } }, { key: { 'usageTariffs.transcription.priceId': 1 } },
    ] },
    { collection: 'billing_grant_transfers', indexes: [
        { key: { fromGrantId: 1 }, unique: true }, { key: { authSubject: 1, state: 1 } },
        { key: { state: 1, updatedAt: 1 } }, { key: { operationId: 1, state: 1 } }, { key: { originalGrantId: 1 } },
        { key: { replacementGrantId: 1 }, unique: true, partialFilterExpression: { replacementGrantId: { $type: 'string' } } },
    ] },
    { collection: 'billing_grant_scope_operations', indexes: [
        { key: { authSubject: 1, state: 1, updatedAt: 1 } }, { key: { state: 1, updatedAt: 1 } },
    ] },
    { collection: 'billing_usage_price_rollouts', indexes: [
        { key: { authSubject: 1, publicationId: 1 }, unique: true }, { key: { state: 1, checkedAt: 1, effectiveAt: 1 } },
    ] },
    { collection: 'billing_operations', indexes: [
        { key: { authSubject: 1, state: 1, createdAt: -1 } }, { key: { state: 1, updatedAt: 1 } },
    ] },
    { collection: 'billing_prepaid_topups', indexes: [
        { key: { authSubject: 1, state: 1, createdAt: -1 } }, { key: { state: 1, updatedAt: 1 } },
        { key: { state: 1, fundingCheckedAt: 1, _id: 1 } },
        { key: { paymentIntentId: 1 }, unique: true, partialFilterExpression: { paymentIntentId: { $type: 'string' } } },
    ] },
    { collection: 'billing_provider_attempts', indexes: [
        { key: { authSubject: 1, recordingId: 1, provider: 1 } }, { key: { externalIds: 1 }, sparse: true },
    ] },
    { collection: 'billing_provider_cost_evidence', indexes: [{ key: { appliedAt: 1 } }] },
    { collection: 'billing_provider_circuits', indexes: [{ key: { provider: 1, model: 1, costPolicyVersion: 1 }, unique: true }] },
    { collection: 'billing_financial_archive', indexes: [{ key: { authSubject: 1, kind: 1 } }] },
    { collection: 'billing_usage_receipts', indexes: [{ key: { authSubject: 1, acceptedAt: 1 } }] },
    { collection: 'billing_operator_cost_receipts', indexes: [{ key: { subject: 1, finishedAt: 1 } }] },
    // billing_internal_costs uses one expense document per hashed subject;
    // its built-in unique _id index already serves every hot-ledger lookup.
    { collection: 'billing_internal_cost_receipts', indexes: [
        { key: { subject: 1, state: 1, unpriced: 1, outcome: 1 } }, { key: { subject: 1, finishedAt: 1 } },
    ] },
    { collection: 'billing_processing_budgets', indexes: [{ key: { subject: 1, state: 1, updatedAt: 1 } }] },
    { collection: 'billing_internal_storage_expenses', indexes: [
        { key: { subject: 1, month: 1 }, unique: true }, { key: { subject: 1, costBasis: 1, estimateStale: 1 } },
    ] },
    { collection: 'users', indexes: [
        { key: { 'billingEntitlement.source': 1, billingRecoveryCheckedAt: 1 } }, { key: { stripeCustomerId: 1 } },
    ] },
    { collection: 'usage_events', indexes: [
        { key: { customerId: 1, meterPriceId: 1, timestamp: 1 } },
        { key: { processingStatus: 1 } },
        { key: { customerId: 1, type: 1, meterPriceId: 1, timestamp: 1 } },
        { key: { authSubject: 1, processingStatus: 1, value: 1 } },
        { key: { authSubject: 1, customerId: 1, state: 1, value: 1 } },
    ] },
    // Money, unresolved debt, and pending usage require explicit settlement
    // proof and its retention deadline. No TTL belongs on these collections.
];

const initialized = new WeakMap<Db, Promise<void>>();

async function awaitInitialization(db: Db, pending: Promise<void>): Promise<void> {
    try { await pending; }
    catch (error) {
        if (initialized.get(db) === pending) initialized.delete(db);
        throw error;
    }
}

/** Explicit initialization rechecks the manifest and refreshes runtime proof. */
export async function initializeBillingIndexes(db: Db): Promise<void> {
    const pending = (async () => {
        for (const group of BILLING_INDEX_GROUPS) await db.collection(group.collection).createIndexes(group.indexes);
    })();
    initialized.set(db, pending);
    await awaitInitialization(db, pending);
}

/** Required financial constraints are installed before managed mutations. */
export async function ensureBillingIndexes(db: Db): Promise<void> {
    const pending = initialized.get(db);
    if (!pending) return initializeBillingIndexes(db);
    await awaitInitialization(db, pending);
}
