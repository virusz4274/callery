/** Old expense accounting is retained as evidence, but cannot suspend new
 * retail billing. Unknown reasons stay blocking until explicitly classified. */
const expenseOnlyReviews = new Set([
    'earned_prepaid_processor_fee_changed',
    'processor_fee_exceeds_operating_funding',
    'incurred_cost_exceeds_retained_funding',
    'invoice_rounding_requires_operating_reserve',
    'processing_cost_exceeded_accepted_cap',
    'verified_provider_cost_requires_operating_funding',
    'provider_cost_exceeded_accepted_cap',
]);

export function isLegacyExpenseReview(review: { reason: string } | undefined): boolean {
    return Boolean(review && expenseOnlyReviews.has(review.reason));
}

export function hasBlockingFinancialReview(account: { costReview?: { reason: string } } | undefined): boolean {
    return Boolean(account?.costReview && !isLegacyExpenseReview(account.costReview));
}

/** This historical review concerns an expense estimate, not customer payment,
 * meter ownership or the outcome of a Stripe operation. */
export function hasBlockingBillingReview(review: { reason: string } | undefined): boolean {
    return Boolean(review && review.reason !== 'provider_cost_evidence_requires_review');
}
