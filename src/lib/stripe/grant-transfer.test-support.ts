import type Stripe from 'stripe';
import { getBillingAccount, ledgerKey } from './ledger';
import { MemoryBillingDatabase, userFixture, clone } from './test-support';
import { createUsageTariffSnapshot, type UsageTariffPair } from './usage-tariff';
import { getUsageMeterDefinitions, type UsagePricingTier } from './catalog';

export function rolloutTariffs(label: string, tier: UsagePricingTier = 'recurring'): UsageTariffPair {
    const make = (kind: 'storage' | 'transcription') => createUsageTariffSnapshot({ catalogVersion: label, usageTier: tier, kind,
        priceId: `price_${label}_${kind}`, meterId: `meter_${label}_${kind}`, eventName: getUsageMeterDefinitions(tier)[kind].eventName,
        currency: 'usd', quantityUnit: kind === 'storage' ? 'milliGiB' : 'weighted_15s_block', aggregation: kind === 'storage' ? 'last' : 'sum',
        unitAmountDecimal: kind === 'storage' ? '0.02' : '0.25', minimumChargeMicros: kind === 'transcription' && tier === 'recurring' ? 10_000 : 0 });
    return { storage: make('storage'), transcription: make('transcription') };
}
export class TransferStripe {
    grants = new Map<string, Stripe.Billing.CreditGrant>();
    transactions: Stripe.Billing.CreditBalanceTransaction[] = [];
    invoiceValues = new Map<string, Stripe.Invoice>();
    subscriptionValues = new Map<string, Stripe.Subscription>();
    expireCalls = 0; createCalls = 0; subscriptionUpdates = 0;
    loseExpire = false; loseCreate = false; omitExpiryDebit = false;
    constructor() {
        const grant = { id: 'cg_original', category: 'paid', customer: 'cus_owner', created: Math.floor(Date.now() / 1000), effective_at: Math.floor(Date.now() / 1000), expires_at: null, voided_at: null,
            amount: { type: 'monetary', monetary: { currency: 'usd', value: 500 } }, metadata: { authSubject: 'owner', topupAttemptId: 'topup_original' }, applicability_config: { scope: { prices: [{ id: 'price_old_storage' }, { id: 'price_old_transcription' }] } } } as unknown as Stripe.Billing.CreditGrant;
        this.grants.set(grant.id, grant); this.addTransaction(grant.id, 'credit', 'credits_granted', 500);
    }
    addTransaction(grantId: string, direction: 'credit' | 'debit', type: string, amount: number) {
        this.transactions.push({ id: `cbtxn_${this.transactions.length}`, credit_grant: grantId, type: direction, [direction]: { type,
            amount: { type: 'monetary', monetary: { currency: 'usd', value: amount } } } } as unknown as Stripe.Billing.CreditBalanceTransaction);
    }
    billing = {
        creditGrants: {
            retrieve: async (id: string) => { const row = this.grants.get(id); if (!row) throw new Error('Unknown fixture grant'); return clone(row); },
            list: (_params: unknown) => { const values = [...this.grants.values()]; return { async *[Symbol.asyncIterator]() { for (const row of values) yield clone(row); } }; },
            expire: async (id: string) => {
                this.expireCalls++; const row = this.grants.get(id)!;
                if (!row.expires_at) {
                    row.expires_at = Math.floor(Date.now() / 1000);
                    const amount = this.transactions.filter(value => value.credit_grant === id).reduce((sum, value) => sum + (value.type === 'credit' ? value.credit!.amount.monetary!.value : -value.debit!.amount.monetary!.value), 0);
                    if (!this.omitExpiryDebit && amount) this.addTransaction(id, 'debit', 'credits_expired', amount);
                }
                if (this.loseExpire) { this.loseExpire = false; throw new Error('Expiry response lost'); }
                return clone(row);
            },
            create: async (params: Stripe.Billing.CreditGrantCreateParams) => {
                this.createCalls++; const row = { ...clone(params), id: `cg_replacement_${this.createCalls}`, created: Math.floor(Date.now() / 1000), effective_at: Math.floor(Date.now() / 1000), expires_at: null, voided_at: null } as unknown as Stripe.Billing.CreditGrant;
                this.grants.set(row.id, row); this.addTransaction(row.id, 'credit', 'credits_granted', row.amount.monetary!.value);
                if (this.loseCreate) { this.loseCreate = false; throw new Error('Create response lost'); }
                return clone(row);
            },
        },
        creditBalanceTransactions: { list: (params: { credit_grant: string }) => {
            const values = this.transactions.filter(row => row.credit_grant === params.credit_grant);
            return { async *[Symbol.asyncIterator]() { for (const row of values) yield clone(row); } };
        } },
    };
    invoices = {
        list: (params: { status?: string }) => { const values = [...this.invoiceValues.values()].filter(row => !params.status || row.status === params.status); return { async *[Symbol.asyncIterator]() { for (const row of values) yield clone(row); } }; },
        retrieve: async (id: string) => clone(this.invoiceValues.get(id)!),
        update: async (id: string, params: Stripe.InvoiceUpdateParams) => { const row = this.invoiceValues.get(id)!; Object.assign(row, params, { metadata: { ...row.metadata, ...params.metadata } }); return clone(row); },
        listLineItems: (id: string) => { const values = this.invoiceValues.get(id)?.lines.data || []; return { async *[Symbol.asyncIterator]() { for (const row of values) yield clone(row); } }; },
    };
    subscriptions = {
        retrieve: async (id: string) => clone(this.subscriptionValues.get(id)!),
        update: async (id: string, params: Stripe.SubscriptionUpdateParams) => {
            this.subscriptionUpdates++; const row = this.subscriptionValues.get(id)!;
            for (const update of params.items || []) { const item = row.items.data.find(value => value.id === update.id)!; item.price.id = update.price!; }
            return clone(row);
        },
    };
    asStripe() { return this as unknown as Stripe; }
}
export function transferFixture(withFunds = true) {
    const memory = new MemoryBillingDatabase(), tariffs = rolloutTariffs('old');
    const user = userFixture({ planKey: 'standard', billingEntitlement: { source: 'subscription', grantedAt: new Date('2026-01-01') }, stripeSubscriptionId: 'sub_owner', stripeSubscriptionStatus: 'active',
        billingUsageTariffs: tariffs, storageUsed: 0, transcriptionUsed: 0, stripeMetering: { subscriptionId: 'sub_owner', storagePriceId: tariffs.storage.priceId, transcriptionPriceId: tariffs.transcription.priceId, verifiedAt: new Date() } });
    const account = getBillingAccount(user);
    if (withFunds) {
        account.fundingLots[ledgerKey('stripe-credit-grant:cg_original')] = { id: 'stripe-credit-grant:cg_original', reference: 'cg_original', source: 'stripe', kind: 'prepaid', amountMicros: 5_000_000,
            spentMicros: 1_000_000, creditedMicros: 0, processorFeeMicros: 300_000, processorFeeRecognizedMicros: 60_000, costMicros: 60_000, reservedCostMicros: 0, createdAt: new Date() };
        account.prepaidFundedMicros = 5_000_000; account.prepaidSpentMicros = 1_000_000; account.recognizedRevenueMicros = 1_000_000;
    }
    account.currentPeriodId = 'period'; account.usageAnchorDay = 1;
    account.periods.period = { id: 'period', start: new Date('2026-10-01'), end: new Date('2026-11-01'), consumedSeconds: 0, storagePeakBytes: 0,
        chargeablePeakBytes: 0, storageCostMicros: 0, storageBilledMilliGiB: 0, storageChargedMicros: 0 };
    user.billingAccount = account;
    memory.collection('users').values.push(user as unknown as Record<string, unknown>);
    const stripe = new TransferStripe();
    stripe.subscriptionValues.set('sub_owner', { id: 'sub_owner', customer: 'cus_owner', status: 'active', billing_mode: { type: 'flexible' }, items: { data: [
        { id: 'si_storage', price: { id: tariffs.storage.priceId, recurring: { usage_type: 'metered' } }, current_period_start: 1790812800, current_period_end: 1793491200 },
        { id: 'si_transcription', price: { id: tariffs.transcription.priceId, recurring: { usage_type: 'metered' } }, current_period_start: 1790812800, current_period_end: 1793491200 },
    ], has_more: false } } as unknown as Stripe.Subscription);
    return { memory, user, tariffs, stripe, runtime: { db: memory.asDb(), stripe: stripe.asStripe() } };
}
