# Stripe Billing Verification Reference

Last reviewed: 2026-03-13

This project should not vendor full Stripe documentation into the repository.
Stripe docs are living documentation and can change independently of this codebase.

Instead, use this file as the stable verification map for the Stripe billing integration in this app.

## Pinned API version

The app currently pins Stripe to:

- `2026-01-28.clover`

Source:

- `src/lib/stripe.ts`

## Official Stripe sources

Use these official docs when verifying billing behavior:

- Checkout Sessions create: https://docs.stripe.com/api/checkout/sessions/create
- Customer Portal Sessions create: https://docs.stripe.com/api/customer_portal/sessions
- List invoices: https://docs.stripe.com/api/invoices/list
- Subscription object: https://docs.stripe.com/api/subscriptions/object
- Stripe webhooks: https://docs.stripe.com/webhooks
- Create billing meter event: https://docs.stripe.com/api/billing/meter-event/create
- Create/configure meters: https://docs.stripe.com/billing/subscriptions/usage-based/meters/create
- Changelog for subscription-level period removal: https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-current-period-start-and-end

## App verification map

### Checkout

Relevant app code:

- `src/app/api/stripe/checkout/route.ts`

What to verify:

- Subscription plans use Checkout `mode=subscription`.
- One-time plans use Checkout `mode=payment`.
- One-time plans enable `invoice_creation.enabled=true` so they can appear in invoice history.
- Success and cancel URLs remain same-origin.
- Metadata/client reference link the Checkout Session back to the local user.

### Customer portal

Relevant app code:

- `src/app/api/stripe/portal/route.ts`

What to verify:

- Portal sessions are created with a valid Stripe customer.
- The return URL is same-origin and points back into the app.
- Portal configuration in Stripe Dashboard matches the product behavior you want to allow.

### Invoices

Relevant app code:

- `src/app/api/stripe/invoices/route.ts`
- `src/app/actions/admin/users/queries.ts`

What to verify:

- User invoice history is read with `customer=<stripeCustomerId>`.
- One-time Checkout purchases that should appear as invoices use Checkout invoice creation.

### Subscription sync

Relevant app code:

- `src/lib/stripe/sync.ts`
- `src/lib/access-control-common.ts`

What to verify:

- Billing period end is derived from subscription items, not deprecated top-level subscription period fields.
- `cancel_at_period_end=true` is not treated as fully canceled before the period actually ends.
- Access restrictions only apply after Stripe’s subscription status and billing period end actually require it.
- Metered subscription items required by the selected plan exist on the subscription.

### Metered billing

Relevant app code:

- `src/lib/stripe/usage.ts`

What to verify:

- Storage meter uses the app’s peak-for-period model and is configured in Stripe to aggregate as `Last`.
- Transcription meter uses incremental events and is configured in Stripe to aggregate as `Sum`.
- Meter event payload keys match the Stripe meter configuration.
- If retry safety becomes important, add a stable `identifier` for meter events.

### Webhooks

Relevant app code:

- `src/app/api/stripe/webhook/route.ts`

What to verify:

- Webhook signature verification uses the raw request body.
- The endpoint is subscribed to every event type the app expects.
- Event processing is idempotent in MongoDB and safe to retry.

## Recommended workflow

When re-auditing Stripe billing:

1. Check `src/lib/stripe.ts` for the pinned API version.
2. Re-open the official Stripe docs above.
3. Verify the app code against those docs.
4. Update this file with any new Stripe behavior changes that affect the app.

## Why not save the full docs?

- They will go stale.
- They create unnecessary repo noise.
- The official Stripe docs are already the source of truth.
- A focused verification map is easier to maintain than a mirrored documentation dump.
