# Billing

This document describes the billing model implemented in the current codebase and how it connects to Stripe.

## Feature Flag

Billing is disabled unless:

```env
NEXT_PUBLIC_ENABLE_BILLING=true
```

When billing is disabled:

- the Billing tab is hidden from Settings
- checkout, portal, and invoice routes return `403`
- metered usage reporting exits early

## Seeded Plans

Plan seeds live in `src/lib/db/init/seed.ts`.

| Plan | Interval | Price | Included Storage | Included Transcription | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Free Trial | monthly | `0 USD` | `100 MiB` | `10 min` | default plan |
| Standard | monthly | `10 USD` | `2 GiB` | `60 min` | paid recurring plan |
| Pro | monthly | `20 USD` | `5 GiB` | `120 min` | paid recurring plan |
| Lifetime | lifetime | `299 USD` | `0` | `0` | one-time purchase, overage-based usage |
| Internal | lifetime | `0 USD` | `1 TiB` | `99999 min` | internal/unrestricted seed |
| Custom | yearly | `0 USD` | `0` | `0` | placeholder enterprise-style seed |

The app enforces the plan document stored in MongoDB, not old marketing copy.

Public pricing behavior is separate from the seed data:

- the pricing page always renders a hardcoded free lane
- paid cards come from `getPublishedPlans()`, which only returns active plans with a non-empty `stripePriceId`
- when no published paid plans exist, the UI falls back to placeholder Standard/Pro marketing cards until Stripe-backed plans are mapped

## Core Rules

1. Users start on the default plan unless an admin changes them.
2. Overage billing only applies when `billingSettings.allowOverage=true`.
3. Metered billing also requires a Stripe customer on the user record.
4. Storage usage is reported as the current peak for the billing period.
5. Transcription usage is reported in seconds, multiplied by the provider multiplier.
6. Manual and webhook-driven transcription both guard against duplicate usage reporting.
7. Free and Free Trial users cannot enable pay-per-usage overage.
8. Lifetime one-time checkout auto-enables overage and seeds the current storage baseline in Stripe.

## Usage Accounting

Storage:

- the app tracks `storageUsed`
- it also tracks `storagePeakUsed` and `storagePeakPeriodEnd`
- when the peak changes for the active Stripe period, it reports `storage_usage_bytes`

Transcription:

- billed duration is rounded up to the nearest `15-second` block by the billing helper
- the provider multiplier is applied before usage totals are stored
- Stripe meter events are emitted as `transcription_usage_seconds`

Default provider multipliers seeded by the app:

- Soniox: `1.0x`
- ElevenLabs: `6.0x`

## Stripe Configuration

Required env:

```env
NEXT_PUBLIC_ENABLE_BILLING=true
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

The Stripe client is pinned to API version:

- `2026-01-28.clover`

## Required Stripe Objects

Create Stripe prices for the plans you want to sell and map them into the `plans` collection:

- `stripePriceId`
- `stripeStoragePriceId`
- `stripeTranscriptionPriceId`

Create two billing meters with these exact event names:

- `storage_usage_bytes`
- `transcription_usage_seconds`

Recommended aggregation:

- storage: `Last`
- transcription: `Sum`

## Checkout And Portal

Relevant code:

- `src/app/api/stripe/checkout/route.ts`
- `src/app/api/stripe/portal/route.ts`

Current behavior:

- the checkout route authenticates the user first
- it looks up the plan by `priceId` or `planName`
- it blocks duplicate active or trialing subscriptions before creating a new Checkout session
- it retrieves the Stripe price to decide whether checkout should run in `subscription` or `payment` mode
- lifetime plans must use a one-time Stripe price
- success, cancel, and return URLs are forced back to the same origin
- one-time purchases enable Checkout invoice creation so they show up in invoice history
- the portal route creates a Stripe customer on demand if the user does not have one yet

## Invoice History

Relevant route:

- `GET /api/stripe/invoices`

Behavior:

- invoices are listed by `stripeCustomerId`
- the route caps `limit` to `50`
- responses include Stripe hosted invoice URLs when available

## Webhook Events

Endpoint:

- `POST /api/stripe/webhook`

The current webhook processor handles:

- checkout completion and async payment outcomes
- checkout expiration
- subscription create, update, delete, pause, resume, trial lifecycle events, and pending-update events
- invoice payment success and failure events
- `customer.deleted`

Webhook processing is idempotent through the `stripe_webhook_events` collection.

## Local Testing

Forward events locally:

```bash
stripe listen --forward-to localhost:9000/api/stripe/webhook
```

Useful test cards:

- success: `4242 4242 4242 4242`
- generic decline: `4000 0000 0000 0002`
- payment failure: `4000 0000 0000 0341`

## Validation Checklist

1. The default plan is seeded and assigned as expected.
2. Checkout upgrades the user and syncs subscription state back into MongoDB.
3. Portal sessions open for users with valid Stripe customers.
4. Invoice history appears in Settings for billed users.
5. Overage off blocks over-limit behavior.
6. Overage on allows usage and creates meter events.
7. ElevenLabs usage reflects the configured multiplier.
8. Webhook retries do not duplicate side effects.
9. `customer.deleted` clears local Stripe linkage.

## Troubleshooting

- `Billing is disabled on this instance.`: `NEXT_PUBLIC_ENABLE_BILLING` is false.
- Checkout says the plan is invalid: the plan is inactive or `stripePriceId` is empty.
- Portal failures: the user is missing a valid Stripe customer.
- `Pay Per Usage cannot be enabled on Free Trial.`: the current plan is `Free` or `Free Trial`.
- Metered usage missing: meter names or aggregation settings do not match the app’s expectations.
- Duplicate billing concerns: inspect `stripe_webhook_events` and the recording-level transcription usage report fields.
