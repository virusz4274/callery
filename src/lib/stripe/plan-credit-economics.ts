import { createHash } from 'node:crypto';
import type { Db } from 'mongodb';
import { mutateBillingAccount, unearnedPrepaidFeeMicros } from './ledger';

export const PLAN_CREDIT_POLICY_VERSION = 'actual-cost-v1';

interface FundingLot { kind: string; amountMicros: number; creditedMicros: number; costMicros: number; reservedCostMicros: number;
    processorFeeMicros?: number; processorFeeRecognizedMicros?: number }
interface CreditReservation { id: string; amountMicros: number; allocations: Record<string, number>; state: 'reserved' | 'applied' | 'released';
    redeemedMicros?: number; redeemedAllocations?: Record<string, number>; redemptionReceipts?: Record<string, number> }
interface CreditAccount { fundingLots: Record<string, FundingLot>; planCreditReservations?: Record<string, CreditReservation>;
    prepaidSpentMicros?: number; recognizedCostMicros?: number; reservedCostMicros?: number;
    usageFunding?: { recurring: { revenueMicros: number; costMicros: number; reservedCostMicros: number };
        lifetime: { revenueMicros: number; costMicros: number; reservedCostMicros: number } }; costReview?: unknown }
const key = (value: string) => createHash('sha256').update(value).digest('hex');

/** Retain incurred costs and existing commitments once, without a profit buffer.
 * Operating protection is already included in each lot's reservedCostMicros. */
export function refundableBaseMicros(account: CreditAccount): number {
    if (account.costReview || ![account.prepaidSpentMicros, account.recognizedCostMicros, account.reservedCostMicros]
        .every(value => Number.isSafeInteger(value) && value! >= 0)) return 0;
    if (Object.values(account.fundingLots).some(lot => [lot.amountMicros, lot.creditedMicros, lot.costMicros, lot.reservedCostMicros]
        .some(value => !Number.isSafeInteger(value) || value < 0))) return 0;
    const perLot = Object.values(account.fundingLots).filter(lot => lot.kind === 'base').reduce((total, lot) => {
        return total + Math.max(0, lot.amountMicros - lot.creditedMicros - lot.costMicros - lot.reservedCostMicros);
    }, 0);
    if (account.usageFunding) {
        if (Object.values(account.usageFunding).some(cohort => [cohort.revenueMicros, cohort.costMicros, cohort.reservedCostMicros]
            .some(value => !Number.isSafeInteger(value) || value < 0))) return 0;
        // Costs paid by earned usage are distinct from base principal. Verify
        // attribution so an unknown cost cannot release unfunded base credit.
        const base = Object.values(account.fundingLots).filter(lot => lot.kind !== 'prepaid');
        const fundedCost = base.reduce((sum, lot) => sum + lot.costMicros, 0) + Object.values(account.usageFunding).reduce((sum, cohort) => sum + cohort.costMicros, 0);
        const fundedReservations = base.reduce((sum, lot) => sum + lot.reservedCostMicros, 0) + Object.values(account.usageFunding).reduce((sum, cohort) => sum + cohort.reservedCostMicros, 0);
        if ((account.recognizedCostMicros || 0) > fundedCost || (account.reservedCostMicros || 0) > fundedReservations) return 0;
        const retained = base.reduce((sum, lot) => sum + lot.amountMicros - lot.creditedMicros - lot.costMicros - lot.reservedCostMicros, 0);
        const earned = Object.values(account.usageFunding).reduce((sum, cohort) => sum + cohort.revenueMicros - cohort.costMicros - cohort.reservedCostMicros, 0);
        return Math.min(perLot, Math.max(0, retained + earned - unearnedPrepaidFeeMicros(account)));
    }
    const retained = Object.values(account.fundingLots).filter(lot => lot.kind !== 'prepaid').reduce((sum, lot) => sum + Math.max(0, lot.amountMicros - lot.creditedMicros), 0);
    return Math.min(perLot, Math.max(0, retained + account.prepaidSpentMicros! - account.recognizedCostMicros! - account.reservedCostMicros! - unearnedPrepaidFeeMicros(account)));
}

export async function reservePlanCredit(subject: string, operationId: string, creditMinor: number, db?: Db): Promise<void> {
    await mutateBillingAccount(subject, async accountValue => {
        const account = accountValue as unknown as CreditAccount;
        const reservations = account.planCreditReservations ||= {};
        const existing = reservations[key(operationId)];
        const amountMicros = creditMinor * 10_000;
        if (!Number.isSafeInteger(amountMicros) || amountMicros < 0) throw new Error('Invalid credit amount.');
        if (existing && existing.state !== 'released') {
            if (existing.amountMicros !== amountMicros) throw new Error('Credit request changed.');
            return;
        }
        if (refundableBaseMicros(account) < amountMicros) throw new Error('The unused credit changed. Request a new billing preview.');
        let remaining = amountMicros;
        const allocations: Record<string, number> = {};
        for (const [lotId, lot] of Object.entries(account.fundingLots)) {
            if (lot.kind !== 'base' || !remaining) continue;
            const capacity = Math.max(0, lot.amountMicros - lot.creditedMicros - lot.costMicros - lot.reservedCostMicros);
            const amount = Math.min(remaining, capacity);
            if (amount) { lot.creditedMicros += amount; allocations[lotId] = amount; remaining -= amount; }
        }
        reservations[key(operationId)] = { id: operationId, amountMicros, allocations, state: 'reserved' };
    }, db);
}

export async function settlePlanCredit(subject: string, operationId: string, applied: boolean, db?: Db): Promise<void> {
    await mutateBillingAccount(subject, async accountValue => {
        const account = accountValue as unknown as CreditAccount;
        const reservation = account.planCreditReservations?.[key(operationId)];
        if (!reservation || reservation.state !== 'reserved') return;
        if (!applied) for (const [lotId, amount] of Object.entries(reservation.allocations)) {
            const lot = account.fundingLots[lotId];
            if (lot) lot.creditedMicros = Math.max(0, lot.creditedMicros - amount + (reservation.redeemedAllocations?.[lotId] || 0));
        }
        reservation.state = applied ? 'applied' : 'released';
    }, db);
}

/** Redeemed invoice credit returns its original cash principal to the service budget.
 * It creates neither revenue nor a new funding lot, and keeps the original source receipt. */
export async function redeemPlanCredit(subject: string, operationId: string, invoiceId: string, amountMinor: number, db?: Db): Promise<void> {
    const amountMicros = amountMinor * 10_000;
    if (!Number.isSafeInteger(amountMicros) || amountMicros < 0) throw new Error('Invalid redeemed credit.');
    await mutateBillingAccount(subject, accountValue => {
        const account = accountValue as unknown as CreditAccount;
        const reservation = account.planCreditReservations?.[key(operationId)];
        if (!reservation || reservation.state === 'released') { if (amountMicros) throw new Error('The paid credit has no funded source.'); return; }
        const receipts = reservation.redemptionReceipts ||= {};
        if (receipts[key(invoiceId)] !== undefined) {
            if (receipts[key(invoiceId)] !== amountMicros) throw new Error('The credit redemption receipt changed.');
            return;
        }
        if ((reservation.redeemedMicros || 0) + amountMicros > reservation.amountMicros) throw new Error('The redeemed credit exceeds its funded source.');
        let remaining = amountMicros;
        const redeemed = reservation.redeemedAllocations ||= {};
        for (const [lotId, allocated] of Object.entries(reservation.allocations)) {
            const amount = Math.min(remaining, allocated - (redeemed[lotId] || 0));
            if (!amount) continue;
            const lot = account.fundingLots[lotId];
            if (!lot || lot.creditedMicros < amount) throw new Error('The credit funding lineage requires review.');
            lot.creditedMicros -= amount; redeemed[lotId] = (redeemed[lotId] || 0) + amount; remaining -= amount;
        }
        if (remaining) throw new Error('The redeemed credit is missing a paid funding allocation.');
        reservation.redeemedMicros = (reservation.redeemedMicros || 0) + amountMicros;
        receipts[key(invoiceId)] = amountMicros;
    }, db);
}
