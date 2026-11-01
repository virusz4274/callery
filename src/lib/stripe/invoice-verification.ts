import { Collections } from '@/lib/mongodb';
import type { User } from '@/lib/db/types';
import { billingDependencies, type BillingDependencies } from './runtime';
import { completeInvoiceLines } from './invoice-funding';
import { invoiceLinePriceId, stripeObjectId } from './objects';
import { reconcileUsageInvoiceRounding, ledgerKey, mutateBillingAccount } from './ledger';
import type { UsageEvent } from './usage-queue';
import { usageMeterContract } from './usage-meter';
import { assertArchivedUsageTariff } from './catalog-publication';
import { ATOMS_PER_CENT, parseUnitPriceAtoms, quoteUsageQuantity } from './usage-tariff';

/** Only authoritative final lines, exact accepted quantities and credit debits establish financial inclusion. */
export async function verifyUsageInvoice(invoiceId: string, dependencies?: BillingDependencies): Promise<number> {
    const { db, stripe } = await billingDependencies(dependencies);
    const invoice = await stripe.invoices.retrieve(invoiceId);
    if (!['open', 'paid', 'uncollectible'].includes(invoice.status || '') || invoice.currency !== 'usd') return 0;
    const customerId = stripeObjectId(invoice.customer);
    const user = customerId && (await db.collection<User>(Collections.USERS).findOne({ stripeCustomerId: customerId })
        || await db.collection<User>('billing_deleted_accounts').findOne({ stripeCustomerId: customerId }));
    if (!user) return 0;
    const lines = await completeInvoiceLines(stripe, invoice), events = db.collection<UsageEvent>(Collections.USAGE_EVENTS);
    let verified = 0;
    for (const line of lines) {
        const priceId = invoiceLinePriceId(line); if (!priceId || line.amount < 0) continue;
        const rows = await events.find({ customerId, meterPriceId: priceId, tariff: { $exists: true },
            timestamp: { $gte: line.period.start, $lt: line.period.end },
            $or: [{ invoiceId: { $exists: false } }, { invoiceId: invoice.id, invoiceLineId: line.id }] }).toArray();
        if (!rows.length || rows.some(row => row.pending || row.processingStatus !== 'processed')) continue;
        const contract = usageMeterContract(rows[0]), { type, usageTier } = contract;
        for (const row of rows) {
            const accepted = usageMeterContract(row);
            if (accepted.kind !== contract.kind || accepted.meterId !== contract.meterId || accepted.eventName !== contract.eventName
                || accepted.unitPriceAtoms !== contract.unitPriceAtoms || accepted.quantityUnit !== contract.quantityUnit) throw new Error('Invoice usage contains a different accepted tariff.');
            await assertArchivedUsageTariff(row.tariff!, db);
        }
        const price = await stripe.prices.retrieve(priceId), meterId = price.recurring?.meter;
        if (meterId !== contract.meterId || price.billing_scheme !== 'per_unit' || price.transform_quantity || price.currency !== contract.currency
            || parseUnitPriceAtoms(String(price.unit_amount_decimal ?? price.unit_amount)) !== contract.unitPriceAtoms) throw new Error('Invoice usage price does not match its immutable catalog.');
        const meter = await stripe.billing.meters.retrieve(meterId);
        if (meter.event_name !== contract.eventName || meter.default_aggregation.formula !== contract.aggregation) throw new Error('Invoice usage meter does not match its accepted aggregation.');
        const quantity = type === 'storage' ? Math.max(...rows.map(row => row.reportedValue)) : rows.reduce((sum, row) => sum + row.reportedValue, 0);
        if (line.quantity !== quantity) throw new Error('Invoice usage quantity does not match the durable period ledger.');
        const exactAtoms = quoteUsageQuantity(contract, quantity).exactAtoms;
        const roundedMinor = Number((BigInt(exactAtoms) + ATOMS_PER_CENT / BigInt(2)) / ATOMS_PER_CENT);
        if (!Number.isSafeInteger(roundedMinor)) throw new Error('Invoice usage amount exceeds the supported range.');
        const principal = line.subtotal ?? line.amount;
        if (principal !== roundedMinor) throw new Error('Invoice usage amount does not match its accepted price and currency rounding.');
        let grantDebitsMinor = 0;
        for await (const transaction of stripe.billing.creditBalanceTransactions.list({ customer: customerId!, limit: 100 })) {
            if (transaction.type !== 'debit' || !transaction.debit) continue;
            const debit = transaction.debit;
            if (debit.type === 'credits_applied' && stripeObjectId(debit.credits_applied?.invoice) === invoice.id
                && debit.credits_applied?.invoice_line_item === line.id && debit.amount.monetary?.currency === 'usd') grantDebitsMinor += debit.amount.monetary.value;
        }
        if ((line.discount_amounts || []).some(discount => discount.amount > 0)) throw new Error('Discounted usage requires net charge and prepaid grant reconciliation before settlement.');
        if (grantDebitsMinor !== principal) throw new Error('Prepaid credit consumption has not been confirmed for this invoice.');
        await mutateBillingAccount(user.authSubject, async account => {
            const key = ledgerKey(`invoice-rounding:${invoice.id}:${line.id}`);
            account.invoiceReconciliations ||= {};
            if (account.invoiceReconciliations[key]) return;
            const { deltaMicros, attributedMicros } = await reconcileUsageInvoiceRounding(account, { type, meterPriceId: priceId, usageTier,
                periodStart: line.period.start, periodEnd: line.period.end, exactAtoms, principalMinor: principal, subject: user.authSubject, db });
            account.invoiceReconciliations[key] = { invoiceId: invoice.id, lineId: line.id, deltaMicros, exactAtoms, attributedMicros, grantDebitsMinor, at: new Date() };
        }, db);
        for (const row of rows) {
            await events.updateOne({ _id: row._id, reportedValue: row.reportedValue, pending: false, processingStatus: 'processed',
                $or: [{ invoiceId: { $exists: false } }, { invoiceId: invoice.id, invoiceLineId: line.id }] },
            { $set: { state: 'billed', invoiceId: invoice.id, invoiceLineId: line.id, billedAt: new Date(), billedQuantity: quantity } });
            verified++;
        }
    }
    return verified;
}
