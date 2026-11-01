import { MongoServerError, ObjectId, type Db } from 'mongodb';
import type Stripe from 'stripe';
import type { Plan, User } from '@/lib/db/types';
import { INITIAL_RETAIL_SEED, BILLING_CATALOG, getUsageMeterDefinitions, type UsagePricingTier } from './catalog';
import { createUsageTariffSnapshot, type UsageTariffPair } from './usage-tariff';

type Row = Record<string, unknown>;
export function clone<T>(value: T): T {
    if (value instanceof Date) return new Date(value) as T;
    if (value instanceof ObjectId) return new ObjectId(value.toHexString()) as T;
    if (Array.isArray(value)) return value.map(clone) as T;
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) as T;
    return value;
}
function get(row: unknown, key: string): unknown { return key.split('.').reduce<unknown>((value, part) => value && typeof value === 'object' ? (value as Row)[part] : undefined, row); }
function eq(a: unknown, b: unknown): boolean {
    if (a instanceof Date || b instanceof Date) return Number(a) === Number(b);
    if (a instanceof ObjectId && b instanceof ObjectId) return a.equals(b);
    if (a && b && typeof a === 'object' && typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
    return a === b;
}
function matches(row: Row, filter: Row): boolean {
    return Object.entries(filter).every(([field, expected]) => {
        if (field === '$or') return (expected as Row[]).some(branch => matches(row, branch));
        if (field === '$and') return (expected as Row[]).every(branch => matches(row, branch));
        const actual = get(row, field);
        if (expected && typeof expected === 'object' && !(expected instanceof Date) && !(expected instanceof ObjectId)) {
            if (Object.keys(expected).every(key => !key.startsWith('$'))) return eq(actual, expected);
            return Object.entries(expected).every(([operator, operand]) => {
                if (operator === '$exists') return (actual !== undefined) === operand;
                if (operator === '$type' && operand === 'string') return typeof actual === 'string';
                if (operator === '$gt') return actual !== undefined && Number(actual) > Number(operand);
                if (operator === '$gte') return actual !== undefined && Number(actual) >= Number(operand);
                if (operator === '$lt') return actual !== undefined && Number(actual) < Number(operand);
                if (operator === '$lte') return actual !== undefined && Number(actual) <= Number(operand);
                if (operator === '$ne') return !eq(actual, operand);
                if (operator === '$in') return (operand as unknown[]).some(value => eq(actual, value));
                if (operator === '$nin') return !(operand as unknown[]).some(value => eq(actual, value));
                if (operator === '$not') return !matches({ value: actual }, { value: operand });
                throw new Error(`Unsupported test operator ${operator}`);
            });
        }
        return eq(actual, expected);
    });
}
function write(row: Row, key: string, value: unknown, unset = false) {
    const parts = key.split('.');
    let target = row;
    for (const part of parts.slice(0, -1)) target = (target[part] ||= {}) as Row;
    if (unset) delete target[parts.at(-1)!]; else target[parts.at(-1)!] = clone(value);
}
function expression(value: unknown, row: Row): unknown {
    if (typeof value === 'string' && value.startsWith('$')) return get(row, value.slice(1));
    if (value && typeof value === 'object' && '$literal' in value) return (value as Row).$literal;
    if (value && typeof value === 'object' && '$ifNull' in value) {
        const items = (value as Row).$ifNull as unknown[];
        return expression(items[0], row) ?? expression(items[1], row);
    }
    return value;
}
function patch(row: Row, update: Row | Row[]) {
    if (Array.isArray(update)) {
        for (const stage of update) {
            const values = Object.fromEntries(Object.entries(stage.$set as Row || {}).map(([key, value]) => [key, expression(value, row)]));
            for (const [key, value] of Object.entries(values)) write(row, key, value);
            for (const key of stage.$unset as string[] || []) write(row, key, undefined, true);
        }
        return;
    }
    for (const [key, value] of Object.entries(update.$set as Row || {})) write(row, key, value);
    for (const key of Object.keys(update.$unset as Row || {})) write(row, key, undefined, true);
    for (const [key, value] of Object.entries(update.$inc as Row || {})) write(row, key, Number(get(row, key) || 0) + Number(value));
    for (const [key, value] of Object.entries(update.$addToSet as Row || {})) {
        const old = (get(row, key) || []) as unknown[];
        if (!old.some(item => eq(item, value))) write(row, key, [...old, value]);
    }
    for (const [key, value] of Object.entries(update.$pull as Row || {})) write(row, key, ((get(row, key) || []) as unknown[]).filter(item => !eq(item, value)));
}
class Rows {
    values: Row[] = [];
    async findOne(filter: Row = {}) { return clone(this.values.find(row => matches(row, filter)) || null); }
    async insertOne(row: Row) {
        if (this.values.some(value => eq(value._id, row._id))) throw new MongoServerError({ code: 11000, message: 'duplicate' });
        this.values.push(clone(row)); return { insertedId: row._id };
    }
    async findOneAndUpdate(filter: Row, update: Row | Row[], options: { returnDocument?: string } = {}) {
        const row = this.values.find(value => matches(value, filter));
        if (!row) return null;
        const old = clone(row); patch(row, update); return clone(options.returnDocument === 'after' ? row : old);
    }
    async countDocuments(filter: Row = {}) { return this.values.filter(value => matches(value, filter)).length; }
    async updateOne(filter: Row, update: Row | Row[], options: { upsert?: boolean } = {}) {
        let row = this.values.find(value => matches(value, filter));
        if (!row && options.upsert) { row = { ...clone(filter), ...clone((!Array.isArray(update) && update.$setOnInsert as Row) || {}) }; this.values.push(row); }
        if (!row) return { matchedCount: 0, modifiedCount: 0 };
        patch(row, update); return { matchedCount: 1, modifiedCount: 1 };
    }
    find(filter: Row = {}) {
        let rows = this.values.filter(row => matches(row, filter));
        const cursor = { sort: (_sort: Row) => cursor, limit: (limit: number) => { rows = rows.slice(0, limit); return cursor; },
            toArray: async () => clone(rows), async *[Symbol.asyncIterator]() { for (const row of rows) yield clone(row); } };
        return cursor;
    }
}
export class MemoryBillingDatabase {
    tables = new Map<string, Rows>();
    collection(name: string) { let value = this.tables.get(name); if (!value) { value = new Rows(); this.tables.set(name, value); } return value; }
    asDb() { return this as unknown as Db; }
    user() { return this.collection('users').values[0] as unknown as User; }
}
export function userFixture(overrides: Partial<User> = {}): User {
    const tier = overrides.billingEntitlement?.source === 'lifetime' ? 'lifetime' : 'recurring';
    const ids = overrides.stripeMetering ? { storage: overrides.stripeMetering.storagePriceId, transcription: overrides.stripeMetering.transcriptionPriceId } : undefined;
    const user = { _id: new ObjectId(), authSubject: 'owner', email: 'owner@example.test', firstName: 'A', lastName: 'User', name: 'A User',
        createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'), planKey: 'free-trial', storageUsed: 100,
        storagePeakUsed: 100, transcriptionUsed: 60, storageAllocation: 1000, transcriptionAllocation: 1000,
        billingSettings: { allowOverage: false }, stripeCustomerId: 'cus_owner', billingEntitlement: { source: 'trial', grantedAt: new Date('2026-01-01') },
        billingUsageTariffs: fixtureUsageTariffs(tier, ids),
        ...overrides } as User;
    // Unit fixtures explicitly stand in for authoritative paid service. A test
    // of missing/expired proof must override this field, never call live Stripe.
    if (user.billingEntitlement?.source === 'subscription' && user.stripeSubscriptionId && !Object.prototype.hasOwnProperty.call(overrides, 'billingPaidBasePeriod')) {
        user.stripePriceId ||= 'price_base';
        user.billingPaidBasePeriod = { customerId: user.stripeCustomerId!, customerGeneration: user.stripeCustomerGeneration || 0,
            subscriptionId: user.stripeSubscriptionId, basePriceId: user.stripePriceId, start: new Date('2020-01-01'), end: new Date('2099-01-01'), invoiceId: 'in_verified_fixture' };
    }
    return user;
}
export function fixtureUsageTariffs(tier: UsagePricingTier = 'recurring', ids?: { storage: string; transcription: string }, catalogVersion: string = BILLING_CATALOG.version,
    rates: Partial<Record<'storage' | 'transcription', string>> = {}): UsageTariffPair {
    const prefix = tier === 'lifetime' ? 'lifetime_' : '';
    return Object.fromEntries((['storage', 'transcription'] as const).map(kind => {
        const definition = getUsageMeterDefinitions(tier)[kind];
        return [kind, createUsageTariffSnapshot({ catalogVersion, usageTier: tier, kind, priceId: ids?.[kind] || `price_${prefix}${kind}`,
            meterId: `meter_${prefix}${kind}`, eventName: definition.eventName, currency: 'usd',
            quantityUnit: kind === 'storage' ? 'milliGiB' : 'weighted_15s_block', aggregation: kind === 'storage' ? 'last' : 'sum',
            unitAmountDecimal: rates[kind] || INITIAL_RETAIL_SEED[tier][kind], minimumChargeMicros: tier === 'recurring' && kind === 'transcription' ? 10_000 : 0 })];
    })) as unknown as UsageTariffPair;
}
export function planFixture(overrides: Partial<Plan> = {}): Plan {
    const lifetime = overrides.interval === 'lifetime';
    return { _id: new ObjectId(), key: 'standard', name: 'Standard', interval: 'monthly', stripePriceId: 'price_base',
        stripeStoragePriceId: lifetime ? 'price_lifetime_storage' : 'price_storage', stripeTranscriptionPriceId: lifetime ? 'price_lifetime_transcription' : 'price_transcription', isActive: true,
        price: lifetime ? 250 : 10, currency: 'usd', billingCatalogVersion: `test:${overrides.key || 'standard'}:${overrides.interval || 'monthly'}:${overrides.stripePriceId || 'price_base'}`,
        limits: lifetime ? { storage: 0, transcription: 0 } : { storage: 2000, transcription: 2000 }, ...overrides } as Plan;
}
/** Complete immutable catalog fixture, independent of live publication and Stripe writes. */
export function seedPublishedCatalogFixture(database: MemoryBillingDatabase, plans: Plan[], costVersion: string, bundleId: string = BILLING_CATALOG.version) {
    const entries = plans.map(plan => {
        const pair = fixtureUsageTariffs(plan.interval === 'lifetime' ? 'lifetime' : 'recurring', {
            storage: plan.stripeStoragePriceId!, transcription: plan.stripeTranscriptionPriceId! }, bundleId);
        plan.usageTariffs = pair; plan.billingCatalogBundleId = bundleId;
        database.collection('billing_catalog_versions').values.push({ _id: plan.billingCatalogVersion, bundleId, tariffVersion: BILLING_CATALOG.version,
            tariff: BILLING_CATALOG, costVersion, costFingerprint: 'test-cost-fingerprint', effectiveAt: new Date('2020-01-01'), publishedAt: new Date('2020-01-01'), plan: clone(plan), usageTariffs: clone(pair) });
        if (!database.collection('plans').values.some(row => row.key === plan.key)) database.collection('plans').values.push(clone(plan) as unknown as Row);
        return { plan: clone(plan), usageTariffs: clone(pair), catalogVersion: plan.billingCatalogVersion };
    });
    database.collection('billing_catalog_bundles').values.push({ _id: bundleId, schemaVersion: 1, state: 'published', createdAt: new Date('2020-01-01'),
        publishedAt: new Date('2020-01-01'), stripeAccountId: 'acct_fixture', livemode: false, costVersion, costFingerprint: 'test-cost-fingerprint', plans: entries, stripeObjects: { prices: [], meters: [] } });
    database.collection('billing_catalog_state').values.push({ _id: 'active', bundleId, revision: 1 });
}
export class FakeBillingStripe {
    sessions = new Map<string, Stripe.Checkout.Session>();
    subscriptionValues: Stripe.Subscription[] = [];
    sessionCreates = 0;
    subscriptionCreates = 0;
    customerHasMethod = true;
    throwAfterSubscriptionCreate = false;
    throwAfterSessionCreate = false;
    badMeter = false;
    keys = new Map<string, string>();
    priceValues = new Map<string, Stripe.Price>();
    invoiceValues = new Map<string, Stripe.Invoice>();
    creditNoteValues = new Map<string, Stripe.CreditNote>();
    accounts = { retrieve: async () => ({ id: 'acct_fixture' }) };
    invoices = {
        retrieve: async (id: string) => { const invoice = this.invoiceValues.get(id); if (!invoice) throw new Error('Missing invoice'); return clone(invoice); },
        list: (input: { customer?: string; status?: string }) => {
            const rows = [...this.invoiceValues.values()].filter(invoice => (!input.customer || invoice.customer === input.customer) && (!input.status || invoice.status === input.status));
            return { async *[Symbol.asyncIterator]() { for (const row of rows) yield clone(row); } };
        },
    };
    creditNotes = {
        retrieve: async (id: string) => { const note = this.creditNoteValues.get(id); if (!note) throw new Error('Missing credit note'); return clone(note); },
        list: (input: { customer?: string }) => {
            const rows = [...this.creditNoteValues.values()].filter(note => !input.customer || note.customer === input.customer);
            return { async *[Symbol.asyncIterator]() { for (const row of rows) yield clone(row); } };
        },
    };
    constructor() {
        this.priceValues.set('price_base', { id: 'price_base', active: true, type: 'recurring', currency: 'usd', recurring: { usage_type: 'licensed', interval: 'month', interval_count: 1 } } as Stripe.Price);
        this.priceValues.set('price_lifetime', { id: 'price_lifetime', active: true, type: 'one_time', currency: 'usd' } as Stripe.Price);
        for (const tier of ['recurring', 'lifetime'] as UsagePricingTier[]) for (const kind of ['storage', 'transcription'] as const) {
            const prefix = tier === 'lifetime' ? 'lifetime_' : '';
            this.priceValues.set(`price_${prefix}${kind}`, { id: `price_${prefix}${kind}`, active: true, type: 'recurring', currency: 'usd', recurring: { usage_type: 'metered', meter: `meter_${prefix}${kind}`, interval: 'month', interval_count: 1 },
                billing_scheme: 'per_unit', unit_amount_decimal: INITIAL_RETAIL_SEED[tier][kind] } as unknown as Stripe.Price);
        }
    }
    prices = { retrieve: async (id: string) => { const price = this.priceValues.get(id); if (!price) throw new Error('Missing price'); return clone(price); } };
    billing = { meters: { retrieve: async (id: string) => ({ status: 'active', event_name: this.badMeter ? 'wrong_name' : getUsageMeterDefinitions(id.includes('lifetime') ? 'lifetime' : 'recurring')[id.endsWith('storage') ? 'storage' : 'transcription'].eventName,
        default_aggregation: { formula: id.endsWith('storage') ? 'last' : 'sum' }, customer_mapping: { event_payload_key: 'stripe_customer_id' }, value_settings: { event_payload_key: 'value' } }) } };
    customers = { retrieve: async (_id: string) => ({ id: 'cus_owner', metadata: { authSubject: 'owner' }, invoice_settings: { default_payment_method: this.customerHasMethod ? 'pm_saved' : null } }) };
    paymentMethods = { retrieve: async (_id: string) => ({ id: 'pm_saved', customer: 'cus_owner' }) };
    paymentIntents = { retrieve: async (_id: string) => ({ id: 'pi_paid', status: 'succeeded', amount_received: 25000, currency: 'usd', customer: 'cus_owner',
        latest_charge: { id: 'ch_paid', paid: true, refunded: false, disputed: false, balance_transaction: { currency: 'usd', fee: 0 } },
        payment_method: this.customerHasMethod ? 'pm_saved' : null }) };
    checkout = { sessions: {
        list: async (_params: unknown) => ({ data: [...this.sessions.values()].map(clone), has_more: false }),
        retrieve: async (id: string) => { const session = this.sessions.get(id); if (!session) throw new Error('Missing session'); return clone(session); },
        listLineItems: async (_id: string) => ({ data: [{ price: this.priceValues.get('price_lifetime'), quantity: 1 }], has_more: false }),
        create: async (params: Stripe.Checkout.SessionCreateParams, options: { idempotencyKey: string }) => {
            const existing = this.keys.get(options.idempotencyKey);
            if (existing) return clone(this.sessions.get(existing)!);
            this.sessionCreates++;
            const id = `cs_${this.sessionCreates}`;
            const session = { id, status: 'open', mode: params.mode, payment_status: 'unpaid', customer: params.customer,
                metadata: params.metadata, client_reference_id: params.client_reference_id, created: Math.floor(Date.now() / 1000),
                expires_at: params.expires_at, url: `https://checkout.stripe.test/${id}` } as Stripe.Checkout.Session;
            this.sessions.set(id, session); this.keys.set(options.idempotencyKey, id);
            if (this.throwAfterSessionCreate) { this.throwAfterSessionCreate = false; throw new Error('Response lost after remote success'); }
            return clone(session);
        },
    } };
    subscriptions = {
        list: async (_params: unknown) => ({ data: this.subscriptionValues.map(clone), has_more: false }),
        retrieve: async (id: string) => { const sub = this.subscriptionValues.find(value => value.id === id); if (!sub) throw new Error('Missing subscription'); return clone(sub); },
        create: async (params: Stripe.SubscriptionCreateParams, options: { idempotencyKey: string }) => {
            const existing = this.keys.get(options.idempotencyKey);
            if (existing) return clone(this.subscriptionValues.find(value => value.id === existing)!);
            this.subscriptionCreates++;
            const sub = this.subscription(`sub_${this.subscriptionCreates}`, 'active', params.metadata as Record<string, string>);
            sub.items.data = params.items!.map(item => ({ id: `si_${item.price}`, price: this.priceValues.get(item.price!)!, current_period_start: 1790812800, current_period_end: 1793491200 } as Stripe.SubscriptionItem));
            this.subscriptionValues.push(sub); this.keys.set(options.idempotencyKey, sub.id);
            if (this.throwAfterSubscriptionCreate) { this.throwAfterSubscriptionCreate = false; throw new Error('Response lost after remote success'); }
            return clone(sub);
        },
    };
    subscription(id = 'sub_existing', status = 'active', metadata: Record<string, string> = {}): Stripe.Subscription {
        return { id, status, customer: 'cus_owner', currency: 'usd', collection_method: 'charge_automatically', billing_mode: { type: 'flexible' }, metadata, items: { data: ['storage', 'transcription'].map(kind => ({
            id: `si_${kind}`, price: this.priceValues.get(`price_${kind}`), current_period_start: 1790812800, current_period_end: 1793491200,
        })) , has_more: false } } as Stripe.Subscription;
    }
    paidLifetime(id = 'cs_paid'): Stripe.Checkout.Session {
        const session = { id, status: 'complete', payment_status: 'paid', mode: 'payment', customer: 'cus_owner', payment_intent: 'pi_paid',
            created: Math.floor(Date.now() / 1000), client_reference_id: 'owner', metadata: { authSubject: 'owner', selectedPlanKey: 'lifetime', selectedPriceId: 'price_lifetime',
                storagePriceId: 'price_lifetime_storage', transcriptionPriceId: 'price_lifetime_transcription' } } as unknown as Stripe.Checkout.Session;
        this.sessions.set(id, session); return session;
    }
    asStripe() { return this as unknown as Stripe; }
}
