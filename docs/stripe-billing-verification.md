# Stripe Billing Verification Reference

This file is a focused verification map for the Stripe integration in this repo. It is intentionally narrower than Stripe’s full documentation and should be updated when the app’s billing behavior changes.

## Pinned API Version

The app currently pins Stripe to:

- `2026-01-28.clover`

Source:

- `src/lib/stripe.ts`

## Relevant App Code

- `src/app/api/stripe/checkout/route.ts`
- `src/app/api/stripe/portal/route.ts`
- `src/app/api/stripe/invoices/route.ts`
- `src/app/api/stripe/webhook/route.ts`
- `src/lib/stripe/customer.ts`
- `src/lib/stripe/sync.ts`
- `src/lib/stripe/usage.ts`

## Checkout

What to verify:

- billing-disabled deployments return `403`
- the selected plan can be found by `priceId` or `planName`
- duplicate active subscriptions are blocked before Checkout starts
- the route derives Checkout `mode` from the Stripe price type
- lifetime plans only use one-time prices
- success and cancel URLs stay same-origin
- one-time purchases enable invoice creation
- checkout metadata links the Stripe session back to the local user

## Customer Portal

What to verify:

- the route authenticates the current user
- a Stripe customer is created on demand if missing
- the return URL is same-origin and points back into the app

## Invoices

What to verify:

- invoices are listed with `customer=<stripeCustomerId>`
- the route handles users with no Stripe customer by returning an empty list
- one-time purchases that should appear in history use Checkout invoice creation

## Subscription Sync

What to verify:

- subscription status changes update the user record
- billing period boundaries come from the synced Stripe data
- canceled-at-period-end behavior does not remove access too early
- the selected plan’s metered Stripe price IDs are present where required

## Metered Usage

What to verify:

- storage events use `storage_usage_bytes`
- transcription events use `transcription_usage_seconds`
- storage reports the period peak, not deltas
- transcription reports weighted seconds after rounding up to `15-second` blocks
- Stripe meter values are sent as whole numbers
- identifiers are stable enough to reduce duplicate reporting risk
- enabling overage seeds a baseline storage event for the current period

## Webhooks

What to verify:

- raw-body signature verification is used
- the webhook endpoint is subscribed to every event type the app expects
- event processing is idempotent in MongoDB
- retrying the same event does not duplicate side effects
- `checkout.session.expired`, `customer.subscription.pending_update_applied`, and `customer.subscription.pending_update_expired` are included in the endpoint subscription set

## Suggested Re-Verification Workflow

1. Review the files listed above.
2. Reconfirm the pinned API version in `src/lib/stripe.ts`.
3. Re-run the key checkout, portal, invoice, webhook, and overage flows in Stripe test mode.
4. Update this document if the app’s billing behavior changes.
