# Billing

This document describes the billing model currently implemented in Call Memo and how to wire Stripe to it.

## Billing Model

The app supports:

- base plans stored in MongoDB
- Stripe Checkout for paid upgrades
- Stripe Customer Portal for self-serve management
- metered storage overage
- metered transcription overage
- per-user overage opt-in through `billingSettings.allowOverage`

Billing can be disabled entirely with:

```env
NEXT_PUBLIC_ENABLE_BILLING=false
```

When billing is disabled, the billing UI is hidden and Stripe operations are skipped.

## Seeded Plans

Plan seeds live in `src/lib/db/init/seed.ts`.

Current seeded plans:

| Plan | Interval | Stored Price | Included Storage | Included Transcription | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Free Trial | monthly | `0` | `100 MiB` | `10 min` | Default plan, 30-day trial language in description |
| Standard | monthly | `10` | `2 GiB` | `60 min` | Main paid plan |
| Pro | monthly | `20` | `5 GiB` | `120 min` | Higher paid tier |
| Lifetime | lifetime | `299` | `0` | `0` | Fully metered after purchase |
| Internal | lifetime | `0` | `1 TiB` | `99999 min` | Internal unrestricted seed |
| Custom | yearly | `0` | `0` | `0` | Enterprise-style placeholder seed |

The app enforces the values stored in the plan document, not any older marketing text.

## Core Rules

1. Trial users start on `Free Trial`.
2. Standard and Pro include bundled storage and transcription allowances.
3. Lifetime has no included allowance in the current seed and relies on metered usage.
4. Overages only apply when the user enables them.
5. Storage billing is based on peak usage for the billing period.
6. Transcription billing is based on seconds processed, multiplied by the provider multiplier.

## Transcription Multipliers

System settings seed these defaults:

- Soniox: `1.0x`
- ElevenLabs: `6.0x`

Reported transcription usage is:

`audio duration in seconds * provider multiplier`

## Required Stripe Environment Variables

```env
NEXT_PUBLIC_ENABLE_BILLING=true
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## Stripe Setup

### 1. Create Stripe meters

The app expects these exact meter event names:

- `storage_usage_bytes`
- `transcription_usage_seconds`

Recommended configuration:

- storage aggregation: `Last`
- transcription aggregation: `Sum`

### 2. Create base plan prices

Create Stripe prices for the plans you want to sell through the app, for example:

- Standard monthly
- Pro monthly
- Lifetime one-time

These values map to `stripePriceId`.

### 3. Create metered prices

Create metered prices for:

- storage overage
- transcription overage

These map to:

- `stripeStoragePriceId`
- `stripeTranscriptionPriceId`

### 4. Map Stripe IDs in the admin UI

Open:

- `/admin/plans`

Set the correct Stripe IDs on each plan document used in production.

### 5. Configure the Stripe Customer Portal

Recommended portal features:

- payment method management
- plan switching
- cancellation
- invoice history

### 6. Configure the webhook endpoint

Endpoint:

- `POST /api/stripe/webhook`

Register these events:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `customer.subscription.paused`
- `customer.subscription.resumed`
- `customer.subscription.trial_will_end`
- `customer.subscription.pending_update_applied`
- `customer.subscription.pending_update_expired`
- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `invoice.payment_action_required`
- `invoice.paid`
- `invoice.voided`
- `invoice.marked_uncollectible`
- `customer.deleted`

## What The App Reports To Stripe

Related code:

- `src/lib/stripe/usage.ts`
- `src/lib/stripe/sync.ts`
- `src/app/api/stripe/webhook/route.ts`

Usage events:

- storage peak for the billing period -> `storage_usage_bytes`
- weighted transcription seconds -> `transcription_usage_seconds`

## Local Stripe Testing

Forward events locally:

```bash
stripe listen --forward-to localhost:9000/api/stripe/webhook
```

Common test cards:

- Success: `4242 4242 4242 4242`
- Generic decline: `4000 0000 0000 0002`
- Payment failure scenario: `4000 0000 0000 0341`

## Validation Checklist

1. New users land on the expected default plan.
2. Checkout upgrades the user and syncs plan data back into MongoDB.
3. Customer portal opens successfully for active paid users.
4. Overage off blocks actions beyond plan limits.
5. Overage on allows continued usage and creates meter events.
6. ElevenLabs usage uses the configured multiplier.
7. Invoice history appears in Settings -> Billing.
8. Webhook retries do not duplicate billing side effects.
9. Customer deletion in Stripe resets billing linkage in the app.

## Troubleshooting

- `Billing disabled`: `NEXT_PUBLIC_ENABLE_BILLING` is false.
- Webhook signature errors: `STRIPE_WEBHOOK_SECRET` is wrong.
- Usage not appearing: Stripe meter names or mapped price IDs do not match the app expectations.
- Portal failures: user is missing a valid `stripeCustomerId` or Stripe portal is not configured.
