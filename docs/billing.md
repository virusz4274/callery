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
    *   **Storage Allowance**: Based on **stored bytes** (Google Drive-style), billed by peak stored bytes per billing period.

3.  **Lifetime**:
    *   One-time payment for platform access.
    *   **No Free Allowance**: All storage and transcription is billed via Metered Billing (`stripe_storage_price_id`, `stripe_transcription_price_id`).
    *   **Overage**: Automatically enabled upon plan switch. Can be toggled off by user to pause spending.

    *   **Overage**: Automatically enabled upon plan switch. Can be toggled off by user to pause spending.

## Transcription Multipliers

Different transcription providers have different costs, which are reflected in billing via **multipliers**.

| Provider | Multiplier | Cost Impact |
| :--- | :--- | :--- |
| **Soniox** (Standard) | **1.0x** | 10 min audio = 10 min billed |
| **ElevenLabs** (Premium) | **6.0x** | 10 min audio = 60 min billed |

*   **Quota Deduction**: If a user has 60 minutes included and uses ElevenLabs for a 10-minute file, 60 minutes are deducted.
*   **Metered Billing**: If paying per usage, the cost is calculated on the *billed duration* (Audio Duration × Multiplier).

## "Pay Per Usage" (Overage)

This setting controls whether a user can exceed their plan limits.

*   **Enabled**:
    *   User can upload/transcribe beyond limits.
    *   Excess usage is reported to Stripe and billed at the end of the billing cycle.
    *   *Default for Lifetime users.*
    *   User is strictly blocked from uploading or transcribing once limits are reached.
    *   *Default for Standard/Pro users.*

### Overage Billing Example (Important)

**Scenario**: User is on the **Pro Plan** (5 GB limit) and has "Pay Per Usage" enabled. They upload files totaling **10 GB**.

1.  **Month 1**:
    *   **Usage**: 10 GB total (5 GB included + 5 GB overage).
    *   **Bill**: $20 (Base Plan) + (5 GB * Storage Rate).
2.  **Month 2** (User keeps files, uploads nothing new):
    *   **Usage**: 10 GB total is re-reported at start of month.
    *   **Bill**: $20 (Base Plan) + (5 GB * Storage Rate).
    *   **Reason**: Storage is a recurring cost. You pay for the space you occupy *every month*.
3.  **Transcription**:
    *   Transcription is **billed once** upon usage. If you transcribe 100 minutes in Month 1, you pay for it in Month 1. You are **not** billed again for those minutes in Month 2, even if you keep the text.

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
    *   **Billing Thresholds**: Configure thresholds on the Stripe Meter itself (optional).

### Passive Recurring Billing (The "Inactive User" Check)

Crucially, the system ensures that users are billed for storage they continue to occupy, even if they do not use the app during a billing cycle.

1.  **Trigger**: When a billing period renews, Stripe sends a `invoice.payment_succeeded` or `customer.subscription.updated` webhook.
2.  **Action**: The `syncSubscription` logic detects the new period (`periodChanged`).
3.  **Result**: The system immediately reports the user's *current* `storageUsed` from MongoDB to Stripe as the baseline for the new month.
4.  **Outcome**: The user is billed for their existing 95GB (for example) even if they never log in or upload new files in Month 2.

*   **Usage Reporting (`src/lib/stripe/usage.ts`)**:
    *   Usage is reported to Stripe via **Meter Events**.
    *   **Storage** is billed by **peak stored bytes per billing period** (deletions do not reduce the billed peak).
    *   A baseline storage event is sent at the start of each billing period, and updates are sent only when a new peak is reached.
    *   Transcription usage is tracked in **seconds**, rounded to 15-second blocks.
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

## Frontend Experience

*   **Billing Alerts**: 
    *   Global banners for "Payment Failed" (Red) and "Trial Expired" (Yellow).
    *   **In-App Notifications**: Alerts for critical events like payment failures or subscription cancellations.
*   **Settings Page**:
    *   **Manage Subscription**: Redirects to **Stripe Customer Portal** for upgrades, downgrades, and cancellations.
    *   **Pay Per Usage Toggle**: User control for overage billing.
    *   **Usage Bars**: Visual representation of current usage vs limits.

### Code Implementation
*   **Component**: `src/components/settings/billing-settings.tsx`
    *   Handles the UI for plan display, usage bars, and the "Pay Per Usage" switch.
*   **State Management**: `src/hooks/use-settings-page.ts`
    *   Manages the async state for portal redirects and setting updates.
*   **API Interactions**:
    *   `POST /api/stripe/portal`: Generates the portal URL.
    *   `PATCH /api/user/billing-settings`: Updates the `allowOverage` flag.

## Stripe Dashboard Setup

To make the billing system work, you must manually configure Products, Prices, and Meters in the Stripe Dashboard.
For full step-by-step instructions, see `docs/stripe-setup.md`.

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
    *   **Name**: Storage Usage (Bytes)
    *   **Event Name**: `storage_usage_bytes` (CRITICAL: Must match exactly)
    *   **Aggregation**: Last (we report the peak stored bytes)
    *   **Value Settings**: "Events include a value"
3.  **Transcription Meter**:
    *   **Name**: Transcription Usage (Seconds)
    *   **Event Name**: `transcription_usage_seconds` (CRITICAL: Must match exactly)
    *   **Aggregation**: Sum
    *   **Value Settings**: "Events include a value to sum"
    *   **Note**: Values are whole seconds (rounded to 15-second blocks).

### 3. Create Metered Prices
Now create Prices that charge based on these Meters.

1.  Create a Product (e.g., "VoSift Usage").
2.  Add a Price:
    *   **Pricing Model**: Per-Unit.
    *   **Usage Type**: Metered.
    *   **Meter**: Select "Storage Usage (Bytes)" (or "Transcription Usage (Seconds)").
    *   **Recurring**: Monthly.
    *   **Recommended**: Use **Per package** pricing so you can set per‑GB and per‑minute rates directly.
    *   **Storage**: package size `1,000,000,000` (bytes) with price = $/GB.
    *   **Transcription**: package size `60` (seconds) with price = $/minute.

### 4. Configure Customer Portal

The application relies on the **default** Customer Portal configuration. You must enable specific features in the Dashboard.

1.  Go to **Settings > Billing > Customer Portal**.
2.  **Enable** the portal if not already active.
3.  **Features**:
    *   [x] **Allow customers to cancel subscriptions**.
    *   [x] **Allow customers to switch plans**.
        *   **CRITICAL**: You must manually add the **Standard** and **Pro** products to the "Products" list in this section. If you don't add them, users can't switch to them.
    *   [x] **Allow customers to update payment methods**.
    *   [x] **Allow customers to view invoice history**.
4.  **Save** changes.

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
