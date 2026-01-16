# Billing & Subscription System

This document details the billing architecture, plan logic, and Stripe integration for the application.

## Overview

The application uses a hybrid billing model combining **Flat-Rate Subscriptions** (Standard/Pro) and **Metered Usage** (Storage/Transcription) with an optional "Pay Per Usage" overage system.

## Plans

The system supports the following plan tiers:

| Plan | Price | Billing | Storage Limit | Transcription Limit | Features |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Free Trial** | $0 | N/A (30 Days) | 100 MB | 10 Minutes | Community Support, 30-Day Expiry |
| **Standard** | $10 | Monthly | 2 GB | 60 Minutes | Email Support, Standard Storage |
| **Pro** | $20 | Monthly | 5 GB | 120 Minutes | Priority Support, Advanced AI, Analytics |
| **Lifetime** | $299 | One-Time | 0 GB (Base) | 0 Min (Base) | **Pay-Per-Usage Only**, Lifetime Access |

### Plan Logic

1.  **Free Trial**:
    *   Hard limits enforced.
    *   Expires 30 days after signup.
    *   No credit card required.
    *   **Expiry**: Users see a yellow banner and must upgrade to continue using actionable features (upload/transcribe). Read-only access is preserved.

2.  **Monthly Subscriptions (Standard/Pro)**:
    *   **Base Fee**: Covers the included storage/transcription limits.
    *   **Limits**: Enforced by default.
    *   **Overage**: If "Pay Per Usage" is enabled in settings, usage beyond the limit is billed via Stripe Metered Billing. If disabled, actions are blocked.

3.  **Lifetime**:
    *   One-time payment for platform access.
    *   **No Free Allowance**: All storage and transcription is billed via Metered Billing (`stripe_storage_price_id`, `stripe_transcription_price_id`).
    *   **Overage**: Automatically enabled upon plan switch. Can be toggled off by user to pause spending.

## "Pay Per Usage" (Overage)

This setting controls whether a user can exceed their plan limits.

*   **Enabled**:
    *   User can upload/transcribe beyond limits.
    *   Excess usage is reported to Stripe and billed at the end of the billing cycle.
    *   *Default for Lifetime users.*
*   **Disabled**:
    *   User is strictly blocked from uploading or transcribing once limits are reached.
    *   *Default for Standard/Pro users.*

## Backend Architecture

### Database Schema
See [Data Model](data-model.md) for full `User` and `Plan` schemas. Key fields:

*   **User**:
    *   `plan`: Current plan name.
    *   `billingSettings.allowOverage`: Boolean toggle for overage.
    *   `stripeSubscriptionStatus`: Synced status (`active`, `past_due`, `canceled`, etc.).
    *   `stripePriceId`: ID of the base plan price.
    *   `storageUsed` / `transcriptionUsed`: Current usage counters.

### Stripe Integration

*   **Sync (`src/lib/stripe/sync.ts`)**:
    *   Webhooks (`invoice.payment_succeeded`, `customer.subscription.updated`) trigger a sync.
    *   **Self-Healing**: Automatically re-adds missing metered subscription items (Storage/Transcription) if they are dropped during a plan switch.
    *   **Billing Thresholds**: Sets a $10 threshold on metered items to trigger automatic invoicing if usage spikes.

*   **Usage Reporting (`src/lib/stripe/usage.ts`)**:
    *   Usage is reported to Stripe (`stripe.subscriptionItems.createUsageRecord`) whenever a file is uploaded (storage) or transcribed (transcription).
    *   Only reports if the user has a valid Stripe subscription and is not on a Free/Trial plan.

### Access Control (`src/lib/access-control.ts`)

Centralized logic determines if a user action is allowed:

1.  **Check Trial**: Is the 30-day window over?
2.  **Check Payment**: Is subscription `past_due` or `unpaid`? (Blocks actions).
3.  **Check Limits**:
    *   If `Lifetime`: Allow (Metered).
    *   If `Free Trial`: Block if limit exceeded.
    *   If `Standard/Pro`: Block if limit exceeded **UNLESS** `allowOverage` is true.

## Frontend Experience

*   **Billing Alerts**: Global banners for "Payment Failed" (Red) and "Trial Expired" (Yellow).
*   **Settings Page**:
    *   **Manage Subscription**: Redirects to **Stripe Customer Portal** for upgrades, downgrades, and cancellations.
    *   **Pay Per Usage Toggle**: User control for overage billing.
    *   **Usage Bars**: Visual representation of current usage vs limits.

## Stripe Dashboard Setup

To make the billing system work, you must manually configure Products and Prices in the Stripe Dashboard.

### 1. Create Base Plan Products
For each paid plan (Standard, Pro, Lifetime), create a Product:

*   **Standard**:
    *   Name: "Standard Plan"
    *   Price: $10.00 USD / Month
    *   Recurring: Monthly
*   **Pro**:
    *   Name: "Pro Plan"
    *   Price: $20.00 USD / Month
    *   Recurring: Monthly
*   **Lifetime**:
    *   Name: "Lifetime Access"
    *   Price: $299.00 USD
    *   One-time purchase

### 2. Create Meters (V2 Billing)
You must create **Meters** in Stripe to track usage.

1.  Go to **Billing > Meters**.
2.  **Storage Meter**:
    *   **Name**: Storage Usage
    *   **Event Name**: `storage_usage_gb` (CRITICAL: Must match exactly)
    *   **Aggregation**: Sum
    *   **Value Settings**: "Events include a value to sum"
3.  **Transcription Meter**:
    *   **Name**: Transcription Usage
    *   **Event Name**: `transcription_usage_min` (CRITICAL: Must match exactly)
    *   **Aggregation**: Sum
    *   **Value Settings**: "Events include a value to sum"

### 3. Create Metered Prices
Now create Prices that charge based on these Meters.

1.  Create a Product (e.g., "VoSift Usage").
2.  Add a Price:
    *   **Pricing Model**: Package or Per-Unit.
    *   **Usage Type**: Metered.
    *   **Meter**: Select "Storage Usage" (or "Transcription Usage").
    *   **Recurring**: Monthly.

### 4. Configure Customer Portal


### 5. Update Application Config

You have two options to update the configuration:

**Option A: Admin Panel (Recommended)**
1.  Log in as an Admin.
2.  Go to `/admin/plans`.
3.  Click **Edit** on each plan (Standard, Pro, Lifetime).
4.  Paste the **Stripe Price ID**, **Stripe Storage Price ID**, and **Stripe Transcription Price ID** into the respective fields.
5.  Click **Update Plan**.

**Option B: Config File (Seed Script)**
You can also hardcode the IDs in the codebase and re-seed the database.
Copy the Price IDs into `src/lib/db/init.ts`...
    *   Standard Base Price ID
    *   Pro Base Price ID
    *   Lifetime Base Price ID
    *   **Shared Storage Price ID** (Use the same ID for all plans or different ones if structured that way)
    *   **Shared Transcription Price ID**

```typescript
{
    name: 'Pro',
    stripePriceId: 'price_PRO_BASE_ID',
    stripeStoragePriceId: 'price_STORAGE_METERED_ID',
    stripeTranscriptionPriceId: 'price_TRANSCRIPTION_METERED_ID',
    // ...
}
```

Then re-run: `npx tsx src/lib/db/init.ts`
1.  Go to **Settings > Billing > Customer Portal**.
2.  **Enable** the portal.
3.  **Features**:
    *   Allow customers to cancel subscriptions.
    *   Allow customers to switch plans (add the Standard and Pro products/prices you created).
    *   Allow customers to update payment methods.
    *   Allow customers to view invoice history.
4.  **Save** changes.

