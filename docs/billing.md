# Billing

This guide is intended to be handoff-friendly for setting up Stripe billing end-to-end.

## Overview

Call Memo uses a hybrid model:

- Base plan pricing (subscription or one-time)
- Metered overage for storage/transcription

Overage enablement is controlled per-user via `billingSettings.allowOverage`.

## Plan Defaults Seeded by App

Source: `src/lib/db/init/seed.ts`

| Plan | Price | Interval | Storage Limit | Transcription Limit |
| :--- | :--- | :--- | :--- | :--- |
| Free Trial | $0 | monthly | 100 MB | 10 min |
| Standard | $10 | monthly | 2 GB | 60 min |
| Pro | $20 | monthly | 5 GB | 120 min |
| Lifetime | $299 | lifetime | 0 (metered) | 0 (metered) |

## Core Billing Rules

1. Trial expiry blocks action-based workflows until upgrade.
2. Standard/Pro enforce limits unless overage is enabled.
3. Lifetime has no included allowance and is fully metered.
4. Storage is billed as recurring overage by period peak.
5. Transcription usage is billed as metered seconds.

## Transcription Multipliers

Default multipliers from system settings:

- Soniox: `1.0x`
- ElevenLabs: `6.0x`

Reported transcription usage = audio duration (seconds) x multiplier.

## Required Environment Variables

```env
NEXT_PUBLIC_ENABLE_BILLING=true
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

If `NEXT_PUBLIC_ENABLE_BILLING=false`, billing UI and Stripe operations are skipped.

## Stripe Dashboard Setup (Step-by-Step)

### 1. Decide pricing model inputs

Before configuring Stripe, decide:

1. Base plan prices (Standard, Pro, Lifetime)
2. Storage overage $/GB
3. Transcription overage $/minute

Recommended unit model:

- `1 GB = 1,000,000,000` bytes

### 2. Create Stripe meters

In Stripe Dashboard -> `Billing` -> `Meters`, create:

1. Storage meter
   - Name: `Storage Usage (Bytes)`
   - Event name: `storage_usage_bytes`
   - Aggregation: `Last`
2. Transcription meter
   - Name: `Transcription Usage (Seconds)`
   - Event name: `transcription_usage_seconds`
   - Aggregation: `Sum`

Event names must match exactly.

### 3. Create base plan prices

Create Stripe products/prices for each paid plan:

- Standard (monthly recurring)
- Pro (monthly recurring)
- Lifetime (one-time)

These map to `stripePriceId`.

### 4. Create usage-based prices

For each plan, configure metered prices for:

- Storage overage (linked to `storage_usage_bytes` meter)
- Transcription overage (linked to `transcription_usage_seconds` meter)

Recommended package configuration:

- Storage package size: `1,000,000,000` units
- Transcription package size: `60` units

### 5. Configure Customer Portal

Enable in Stripe customer portal:

- Plan switching
- Cancellation
- Payment method updates
- Invoice history

### 6. Configure webhook endpoint

Endpoint in app:

- `POST /api/stripe/webhook`

Configure these events in Stripe (exact names):

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

Webhook processing is idempotent: each Stripe event ID is tracked in
`stripe_webhook_events` and retried safely on failures.

### 7. Map IDs inside app

Go to admin UI:

- `/admin/plans`

For each paid plan, set:

- `stripePriceId`
- `stripeStoragePriceId`
- `stripeTranscriptionPriceId`

## How App Reports Usage

- Storage: peak bytes for billing period (`storage_usage_bytes`)
- Transcription: rounded/weighted seconds (`transcription_usage_seconds`)

Related code:

- `src/lib/stripe/usage.ts`
- `src/lib/stripe/sync.ts`
- `src/app/api/stripe/webhook/route.ts`

## Sandbox Validation Checklist

Use these tests after setup:

1. New user starts on Free Trial limits.
2. Checkout upgrades user to Standard/Pro.
3. Overage OFF blocks usage past plan limits.
4. Overage ON allows usage and reports meter events.
5. ElevenLabs usage reflects multiplier.
6. Deleting files lowers app usage but does not lower already reported monthly peak.
7. Plan change retains correct metered items.
8. Failed payment moves subscription to restricted behavior.
9. Lifetime plan is usable with fully metered billing.
10. Webhook retries do not create duplicate-billing corruption.
11. Stripe invoice history appears in Settings billing tab.

## Local Stripe Testing

Run webhook forwarding:

```bash
stripe listen --forward-to localhost:9000/api/stripe/webhook
```

Helpful test cards:

- Success: `4242 4242 4242 4242`
- Declined: `4000 0000 0000 0002`
- Payment failure scenario: `4000 0000 0000 0341`

## Troubleshooting

- Signature errors: wrong `STRIPE_WEBHOOK_SECRET`.
- No usage events: meter names or mapped price IDs are wrong.
- Portal failures: missing `stripeCustomerId` or portal config incomplete.
