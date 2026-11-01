import { BILLING_CATALOG } from './catalog';

export const REQUIRED_BILLING_CHECKS = ['invoices', 'creditGrants', 'proration', 'meterErrors', 'invoiceRounding',
    'uploadLengths', 'storageLifecycle', 'processingLimits', 'concurrentAccounting', 'planSwitches', 'retention', 'priceRollovers', 'hostedPlanPayments'] as const;
export interface BillingLaunchEvidence {
    schemaVersion?: 2;
    tariffVersion: string; stripeAccountId: string;
    catalogVersion?: string; livemode?: boolean;
    /** Historical metadata only; operational prices and costs do not gate sales. */
    costVersion?: string; costFingerprint?: string; expiresAt?: string;
    verifiedAt: string; priceIds: string[];
    checks: Record<typeof REQUIRED_BILLING_CHECKS[number], boolean>;
}
export interface CatalogAcceptanceContext {
    catalogVersion: string; costFingerprint?: string; stripeAccountId: string; livemode: boolean;
}
function environmentEvidence(): BillingLaunchEvidence | undefined {
    try { return JSON.parse(process.env.BILLING_LAUNCH_EVIDENCE_JSON || '') as BillingLaunchEvidence; }
    catch { return undefined; }
}
/** Pure validation also supports reviewed evidence saved with an immutable catalog. */
export function validateBillingEvidence(_historicalCostVersion: string | undefined, priceIds: string[], proof: BillingLaunchEvidence | undefined, context?: CatalogAcceptanceContext): void {
    const at = Date.parse(proof?.verifiedAt || '');
    if (!proof || proof.schemaVersion !== 2 || proof.tariffVersion !== BILLING_CATALOG.version || !proof.stripeAccountId?.startsWith('acct_')
        || !Number.isFinite(at) || at > Date.now()
        || !Array.isArray(proof.priceIds) || priceIds.some(id => !proof.priceIds.includes(id))
        || REQUIRED_BILLING_CHECKS.some(check => proof.checks?.[check] !== true)
        || context && (proof.catalogVersion !== context.catalogVersion || proof.stripeAccountId !== context.stripeAccountId || proof.livemode !== context.livemode)) {
        throw new Error('Live billing acceptance is incomplete or does not cover this catalog, Stripe account and mode.');
    }
}
/** Imported catalog evidence permits reviewed price changes without editing deployment environment files. */
export function assertCatalogBillingReady(costVersion: string | undefined, priceIds: string[], evidence?: BillingLaunchEvidence, context?: CatalogAcceptanceContext): void {
    const live = context?.livemode || process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_') || process.env.STRIPE_SECRET_KEY?.startsWith('rk_live_');
    if (!live) return; // Sandbox acceptance must remain possible before proof exists.
    const proof = evidence || environmentEvidence();
    if (!proof) throw new Error('Live billing is blocked until payment, metering and processing acceptance is recorded.');
    validateBillingEvidence(costVersion, priceIds, proof, context);
    if (!process.env.STRIPE_WEBHOOK_SECRET || !process.env.STRIPE_METER_WEBHOOK_SECRET) throw new Error('Live billing requires both verified webhook signing secrets.');
}
/** Legacy callers still fail closed; published catalog paths supply their own reviewed evidence. */
export function assertLiveBillingReady(costVersion?: string, priceIds: string[] = []): void {
    assertCatalogBillingReady(costVersion, priceIds);
}
