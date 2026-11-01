import { NextRequest, NextResponse } from 'next/server';
import { billingEnabled } from '@/lib/config';
import { env } from '@/lib/env';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import { flushUsageEvents, reconcileUsageProcessing } from '@/lib/stripe/usage-queue';
import { reconcileBilling } from '@/lib/stripe/reconcile';
import { processBillingRecovery } from '@/lib/stripe/recovery';
import { processFinancialSettlements } from '@/lib/stripe/financial-settlement';
import { getMongoDb } from '@/lib/mongodb';
import { getStripe } from '@/lib/stripe';
import { repairTranscriptionReceipts } from '@/lib/stripe/transcription-receipt';
import { drainLedgerOutbox } from '@/lib/stripe/usage';
import { reconcileUsageInvoices } from '@/lib/stripe/invoice-reconciliation';
import { hasLegacyProviderCostWork, reconcilePendingProviderCosts, reconcileSonioxCosts } from '@/lib/stripe/provider-costs';
import { processUsagePriceRollouts } from '@/lib/stripe/usage-price-rollout';
import { reconcileUsageGrantScopes } from '@/lib/stripe/grant-transfer';
import { refreshCatalogDiscovery } from '@/lib/stripe/catalog-discovery';
import { ensureBillingIndexes } from '@/lib/stripe/database';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
    if (!isAuthorizedCronRequest(request.headers.get('authorization'), env.CRON_SECRET)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!billingEnabled()) return NextResponse.json({ sent: 0, failed: 0, billingEnabled: false });
    const db = await getMongoDb(), stripe = getStripe(), dependencies = { db, stripe };
    await ensureBillingIndexes(db);
    const catalog = await refreshCatalogDiscovery(dependencies);
    const grantScopes = await reconcileUsageGrantScopes(dependencies);
    const priceRollouts = await processUsagePriceRollouts(dependencies);
    const billing = await reconcileBilling(20, dependencies);
    const repaired = await repairTranscriptionReceipts(db);
    const outbox = await drainLedgerOutbox(undefined, db);
    const usage = await flushUsageEvents();
    const processed = await reconcileUsageProcessing(50, db);
    const invoices = await reconcileUsageInvoices(db, getStripe());
    const legacyCosts = await hasLegacyProviderCostWork(db);
    const providerCosts = legacyCosts ? await reconcilePendingProviderCosts(db) : 0;
    let sonioxCosts: { verified: number; pending: number } | { review: boolean } = { verified: 0, pending: 0 };
    if (legacyCosts) try { sonioxCosts = await reconcileSonioxCosts(db); } catch { sonioxCosts = { review: true }; }
    const recovery = await processBillingRecovery(db);
    const settlements = await processFinancialSettlements(db, getStripe());
    return NextResponse.json({ ...usage, catalog, grantScopes, priceRollouts, billing, repaired, outbox, processed, invoices, providerCosts, sonioxCosts, recovery, settlements });
}
