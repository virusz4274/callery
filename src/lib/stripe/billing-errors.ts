import type { ReserveCostInput } from './ledger';

/** A verified shortage of spendable prepaid credit, never missing cost or payment evidence. */
export class PrepaidFundingRequiredError extends Error {}

export class BillingSyncPendingError extends Error {
    readonly code = 'billing_sync_pending';
    constructor(message = 'Your billing change is being synchronized. Retry shortly.') {
        super(message);
        this.name = 'BillingSyncPendingError';
    }
}

/** Operator cash committed to accepted work is distinct from customer credit. */
export class OperatingFundingUnavailableError extends Error {
    readonly code = 'operating_funds_unavailable';
}

/** Pure admission signal; remote cancellation must happen outside the ledger CAS. */
export class PendingPlanCreditBlocksUsageError extends Error {
    constructor(public operationId: string, public requiredRetainedMicros: number, public request: ReserveCostInput) {
        super('The unpaid upgrade is reserving funds needed by your current paid plan.');
    }
}
