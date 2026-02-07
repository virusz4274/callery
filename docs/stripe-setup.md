# Stripe Setup (Plans + Peak Storage Metering)

This guide explains how to configure Stripe products, prices, and meters for this app. It supports:

1. Base subscription plans (Standard, Pro, Lifetime, etc).
2. Storage overage billed by **peak stored bytes per billing period**.
3. Transcription overage billed by **total seconds** (rounded to 15-second blocks in code).

## Quick Decisions

1. Decide the included storage and transcription limits per plan.
2. Decide the overage price per GB and per minute for each plan.
3. Choose your GB definition for pricing.

Option A: `1 GB = 1,000,000,000 bytes` (decimal GB, recommended for pricing).  
Option B: `1 GiB = 1,073,741,824 bytes` (binary GiB, matches some infra tools).

## Meters (Create Once, Shared by All Plans)

Create these meters in **Billing → Meters**. Meters attach to prices, and the same meter can be reused across multiple prices and plans.

1. Storage Meter  
Name: `Storage Usage (Bytes)`  
Event name: `storage_usage_bytes`  
Aggregation method: **Last** (we report peak stored bytes for the period).  
Value key: `value` (default)  
Customer key: `stripe_customer_id` (default)

2. Transcription Meter  
Name: `Transcription Usage (Seconds)`  
Event name: `transcription_usage_seconds`  
Aggregation method: **Sum** (we report seconds used).  
Value key: `value` (default)  
Customer key: `stripe_customer_id` (default)

## Base Plan Products and Prices

Create one base product per plan in **Product Catalog**:

1. Example: `Standard Plan` with monthly recurring price.
2. Example: `Pro Plan` with monthly recurring price.
3. Example: `Lifetime Access` with one-time price.

These base prices map to `stripePriceId` in your plan records.

## Usage (Overage) Products and Prices

Each plan needs two usage-based prices:

1. Storage overage price for that plan.
2. Transcription overage price for that plan.

You can reuse a **single Usage product** and create multiple prices for different plans, or create separate usage products per plan. Both are valid in Stripe. The key is that each plan has its own usage price IDs.

### Storage Overages (Peak Stored Bytes)

1. Create a usage-based price.
2. Select the **Storage Usage (Bytes)** meter.
3. Pricing structure: **Per package** (recommended).
4. Package size: `1,000,000,000` units (bytes) for **per‑GB pricing**.
5. Package price: your plan’s **$/GB** overage rate.

### Transcription Overages (Seconds)

1. Create a usage-based price.
2. Select the **Transcription Usage (Seconds)** meter.
3. Pricing structure: **Per package** (recommended).
4. Package size: `60` units (seconds) for **per‑minute pricing**.
5. Package price: your plan’s **$/minute** overage rate.

## Plan → Stripe ID Mapping (Required)

Each plan in your database needs three Stripe price IDs:

1. `stripePriceId` (base subscription).
2. `stripeStoragePriceId` (storage overage).
3. `stripeTranscriptionPriceId` (transcription overage).

Set these through the Admin panel:

1. Go to `/admin/plans`.
2. Edit each plan and fill in the three price IDs.

## How Usage Is Sent to Stripe

1. Storage billing uses **peak stored bytes** per billing period.
2. We send a baseline storage event at period start (webhook).
3. We only send a new storage event when a **new peak** is reached.
4. Transcription usage events are sent as **seconds** (rounded to 15s blocks in code).
    *   **Note**: This is satisfying **Billed Duration**.
    *   Formula: `Audio Duration (s) × Provider Multiplier`
    *   Example: 60s ElevenLabs audio (6x) = 360s reported to Stripe.

### Billing Thresholds (Automated)
The application is configured to automatically charge users when their unbilled usage (overage) exceeds **$10.00**.

*   **New Subscriptions**: The code in `src/app/api/stripe/checkout` automatically applies `billing_thresholds: { amount_gte: 1000 }` to all new subscriptions.
*   **Existing Subscriptions**: You can apply this rule to existing users by running the backfill script:
    ```bash
    npx tsx scripts/set-billing-thresholds.ts
    ```
*   **Effect**: When a user's metered usage hits $10, Stripe immediately invoices and charges them, resetting their unbilled balance. Their monthly billing cycle date remains unchanged.

## Notes on Testing

Use the existing test plan in `docs/billing_test_plan.md` for end‑to‑end verification.
