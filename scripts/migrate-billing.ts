import { config } from 'dotenv';
import { getMongoClient, getMongoDb, Collections } from '../src/lib/mongodb';
import type { User, AdminLog, Recording } from '../src/lib/db/types';
import { classifyLegacyBilling, classifyLegacyTranscription, legacyTranscriptionReceiptIds } from '../src/lib/stripe/migration';
import type { UsageEvent } from '../src/lib/stripe/usage-queue';
import { getBillingAccount, ensurePeriod } from '../src/lib/stripe/ledger';
import { BILLING_CATALOG } from '../src/lib/stripe/catalog';

// Deliberately dry-run by default; neither mode calls Stripe or creates charges.
config({ quiet: true });
const args = process.argv.slice(2);
if (args.includes('--help')) {
    console.log('pnpm exec tsx scripts/migrate-billing.ts [--apply] [--receipts] [--v2]\nDefault: dry run. --v2 preserves consumed quota in the monthly ledger, starts prepaid balance at zero and quarantines legacy meters for reconciliation. --receipts classifies historical transcription aliases. --apply writes classifications; no Stripe calls are made.');
} else {
    if (args.some(arg => !['--apply', '--receipts', '--v2'].includes(arg))) throw new Error('Unknown argument. Use --help.');
    const apply = args.includes('--apply');
    const client = await getMongoClient();
    try {
        const db = await getMongoDb();
        let reviewed = 0;
        let proposed = 0;
        let changed = 0;
        for await (const user of db.collection<User>(Collections.USERS).find({ billingEntitlement: { $exists: false } })) {
            const assignment = await db.collection<AdminLog>(Collections.ADMIN_LOGS).findOne({ targetId: user._id.toString(),
                action: 'USER_LIMITS_UPDATE', 'details.action': 'PLAN_ASSIGNMENT' }, { sort: { createdAt: -1 } });
            const classification = classifyLegacyBilling(user, assignment);
            if (classification.skip) continue;
            proposed++;
            if (classification.reviewReason) reviewed++;
            console.log(JSON.stringify({ userId: user._id.toString(), outcome: classification.entitlement?.source || 'manual_review', reason: classification.reviewReason }));
            if (!apply) continue;
            const result = await db.collection<User>(Collections.USERS).updateOne({ _id: user._id, billingEntitlement: { $exists: false },
                billingReview: { $exists: false }, updatedAt: user.updatedAt, planKey: user.planKey,
                stripeSubscriptionId: user.stripeSubscriptionId ?? { $exists: false } }, {
                $set: { ...(classification.entitlement ? { billingEntitlement: classification.entitlement } : {}),
                    ...(classification.reviewReason ? { billingReview: { reason: classification.reviewReason, createdAt: new Date() } } : {}),
                    'billingSettings.allowOverage': false, updatedAt: new Date() },
                $unset: { stripeMetering: '' },
            });
            changed += result.modifiedCount;
        }
        let receiptsReviewed = 0;
        if (args.includes('--receipts') || args.includes('--v2')) for await (const recording of db.collection<Recording>(Collections.RECORDINGS).find({ transcriptionReceipt: { $exists: false }, transcriptionLegacyBilling: { $exists: false }, externalTranscriptionId: { $exists: true } })) {
            const matches = await db.collection<UsageEvent>(Collections.USAGE_EVENTS).find({ _id: { $in: legacyTranscriptionReceiptIds(recording) } }).toArray();
            const classification = classifyLegacyTranscription(recording, matches);
            if (classification.state === 'skip') continue;
            receiptsReviewed++;
            console.log(JSON.stringify({ recordingId: recording._id.toString(), state: classification.state, reason: classification.reason }));
            if (apply) await db.collection<Recording>(Collections.RECORDINGS).updateOne({ _id: recording._id, updatedAt: recording.updatedAt, transcriptionReceipt: { $exists: false }, transcriptionLegacyBilling: { $exists: false } }, {
                $set: { transcriptionLegacyBilling: { ...classification, reviewedAt: new Date() } },
            });
        }
        let v2Accounts = 0, quarantined = 0;
        if (args.includes('--v2')) {
            for await (const user of db.collection<User>(Collections.USERS).find({ billingAccount: { $exists: false } })) {
                const account = getBillingAccount(user); ensurePeriod(account, user);
                const paid = Boolean(user.stripeSubscriptionId || user.lifetimePurchase || ['subscription', 'lifetime'].includes(user.billingEntitlement?.source || ''));
                v2Accounts++;
                console.log(JSON.stringify({ userId: user._id.toString(), preservedConsumedSeconds: user.transcriptionUsed, prepaidBalanceMicros: 0, needsCatalogReview: paid }));
                if (apply) await db.collection<User>(Collections.USERS).updateOne({ _id: user._id, updatedAt: user.updatedAt, billingAccount: { $exists: false } }, {
                    $set: { billingAccount: account, 'billingSettings.allowOverage': false,
                        ...(paid && !user.billingReview ? { billingReview: { reason: 'catalog_v2_migration_required', createdAt: new Date() } } : {}) },
                    $unset: { stripeMetering: '' },
                });
            }
            for await (const event of db.collection<UsageEvent>(Collections.USAGE_EVENTS).find({ catalogVersion: { $ne: BILLING_CATALOG.version }, state: { $ne: 'billed' } })) {
                quarantined++;
                if (apply) await db.collection<UsageEvent>(Collections.USAGE_EVENTS).updateOne({ _id: event._id, updatedAt: event.updatedAt }, {
                    $set: { pending: false, state: 'needs_review', processingStatus: 'needs_review', reviewReason: 'legacy_meter_requires_invoice_reconciliation' },
                });
            }
        }
        console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', proposed, manualReview: reviewed, changed, receiptsReviewed, v2Accounts, quarantined }));
    } finally { await client.close(); }
}
