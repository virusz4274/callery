# Billing

This document describes the billing model and provides a complete walkthrough for configuring Stripe — from a blank account through to accepting live payments.

For the quick setup steps, see [setup-guide.md Step 8](setup-guide.md#step-8-stripe-billing-setup). This document covers the technical details, the full Stripe configuration walkthrough, and troubleshooting.

---

## Feature Flag

Billing is disabled unless:

```env
NEXT_PUBLIC_ENABLE_BILLING=true
```

When billing is disabled:

- the Billing tab is hidden from Settings
- checkout, portal, and invoice routes return `403`
- metered usage reporting exits early

---

## Seeded Plans

Plan seeds live in `src/lib/db/init/seed.ts`.

| Key | Plan | Interval | Price | Included Storage | Included Transcription | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `free-trial` | Free Trial | monthly | `0 USD` | `100 MiB` | `10 min` | default plan, assigned to all new users |
| `standard` | Standard | monthly | `10 USD` | `2 GiB` | `60 min` | paid recurring plan |
| `pro` | Pro | monthly | `20 USD` | `5 GiB` | `120 min` | paid recurring plan |
| `lifetime` | Lifetime | lifetime | `250 USD` | `0` | `0` | one-time purchase; a metered usage subscription is auto-created to bill ongoing storage and transcription |
| `internal` | Internal | lifetime | `0 USD` | `1 TiB` | `99999 min` | admin-assigned only; no Stripe price |
| `custom` | Custom | yearly | `0 USD` | `0` | `0` | admin-assigned only; no Stripe price |

**Important:** The seed uses `$setOnInsert`, which means running `npm run db:init` only populates plans that do not yet exist. If you need to change plan limits or prices after the initial seed, edit them through `/admin/plans` in the UI or directly in MongoDB.

The app enforces plan limits from the MongoDB document, not from Stripe metadata. The pricing page only shows plans that are `isActive: true`, `isDefault: false`, and have a non-empty `stripePriceId`.

---

## Core Billing Rules

1. Users start on the `free-trial` plan. An admin can change this.
2. Overage billing only applies when `billingSettings.allowOverage = true` on the user document.
3. Metered billing also requires a `stripeCustomerId` on the user record.
4. Storage usage is reported as the **peak** bytes stored in the current billing period (not cumulative).
5. Transcription usage is reported in **seconds**, rounded up to the nearest 15-second block, then multiplied by the provider multiplier.
6. Both manual and webhook-driven transcription guard against duplicate usage reporting using a per-recording flag.
7. Free-trial users cannot enable pay-per-usage overage.
8. Lifetime one-time checkout auto-enables overage and seeds the current storage level as the baseline meter value.

---

## Usage Accounting

### Storage

- `storageUsed` — total bytes currently stored (updated on upload and deletion)
- `storagePeakUsed` — the highest `storageUsed` seen within the current Stripe billing period
- `storagePeakPeriodEnd` — the period end timestamp associated with `storagePeakUsed`

When a user uploads a file, the app checks whether the new `storageUsed` is higher than `storagePeakUsed`. If it is, it updates the peak and sends a `storage_usage_bytes` meter event to Stripe with the new peak value. Because the meter uses **Last** aggregation, Stripe always uses the most recent value for billing — this correctly bills for peak storage, not total cumulative uploads.

When a billing period renews (detected via `stripeCurrentPeriodEnd` changing in the webhook), the app resets `storagePeakUsed` to the current `storageUsed` value and sends a fresh baseline meter event for the new period.

### Transcription

- `transcriptionUsed` — total cost-adjusted seconds used in the current period
- Billed duration is rounded up to the nearest `15-second` block by `calculateBilledDuration()`
- The provider multiplier is applied: Soniox 1.0×, ElevenLabs 6.0× (configurable in admin settings)
- Stripe meter events are emitted as `transcription_usage_seconds` (Sum aggregation)

Default provider multipliers seeded by the app:

| Provider | Default Multiplier |
| :--- | :--- |
| Soniox | 1.0× |
| ElevenLabs | 6.0× |

These multipliers reflect relative cost differences between providers. They are configurable in `/admin/settings` and affect both the local `transcriptionUsed` counter and the Stripe meter event value.

---

## Stripe Configuration Walkthrough

### Required environment variables

```env
NEXT_PUBLIC_ENABLE_BILLING=true
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

The Stripe client uses API version `2026-01-28.clover`. The `.clover` suffix is a Stripe **preview feature flag** required to access the Meters V2 API (`stripe.billing.meterEvents`). Without this API version, metered usage reporting would be unavailable. This is not the stable version number — it is intentional.

### Step 1: Create the two Billing Meters

Meters must be created before you create metered prices. The event names are hardcoded in the app and must match exactly.

1. In Stripe Dashboard, go to **Billing → Meters**.
2. Click **Create meter**:
   - Display name: `Storage Usage`
   - Event name: **`storage_usage_bytes`** (exact match required)
   - Default aggregation formula: **Last**
   - Click **Create meter**.
3. Click **Create meter** again:
   - Display name: `Transcription Usage`
   - Event name: **`transcription_usage_seconds`** (exact match required)
   - Default aggregation formula: **Sum**
   - Click **Create meter**.

> [!WARNING]
> **Aggregation formula matters.** Storage must use **Last** — Stripe bills the most-recent value reported, which is the peak. If you accidentally use Sum, customers would be charged for the accumulated total of every storage report, causing massive over-billing. Transcription must use **Sum** — each recording adds to the running total for the period.

### Step 2: Create products and prices

For each paid plan, you need three Stripe prices: one base price and two metered prices (storage and transcription). The metered prices must be linked to the meters you created in Step 1.

#### Standard plan (monthly, $10/month)

1. In Stripe Dashboard, go to **Product Catalog → Add product**.
2. Name: `Standard`. Click **Add a price**:
   - Pricing model: **Standard pricing**
   - Billing period: **Monthly**, recurring
   - Price: `$10.00` per month
   - Click **Save product**. Copy the **Price ID** → this is `stripePriceId` for Standard.
3. On the same product page, click **Add another price**:
   - Pricing model: **Standard pricing**, recurring, monthly
   - Billing scheme: **Per unit**, Usage type: **Metered**, Meter: `Storage Usage`
   - Set your per-GB-month rate (e.g. `$0.023` per GB is close to S3 pricing)
   - Click **Add price**. Copy the **Price ID** → this is `stripeStoragePriceId` for Standard.
4. Click **Add another price** again:
   - Same settings, but Meter: `Transcription Usage`
   - Set your per-second rate
   - Click **Add price**. Copy the **Price ID** → this is `stripeTranscriptionPriceId` for Standard.

#### Pro plan (monthly, $20/month)

Repeat the process above with `$20.00` for the base price and your desired overage rates for storage and transcription.

#### Lifetime plan (one-time, $250)

1. In Stripe Dashboard, go to **Product Catalog → Add product**.
2. Name: `Lifetime`. Click **Add a price**:
   - Pricing model: **Standard pricing**
   - Frequency: **One time** (not recurring)
   - Price: `$250.00`
   - Click **Save product**. Copy the **Price ID** → this is `stripePriceId` for Lifetime.
3. Add metered prices (storage and transcription) the same way as Standard/Pro.
   - The Lifetime plan uses these for the usage-only subscription created automatically after purchase.

> [!NOTE]
> The `internal` and `custom` plans intentionally have no Stripe prices. They are admin-assigned only and never appear on the public pricing page.

### Step 3: Register the webhook endpoint

Webhooks are how Stripe tells the app when payments succeed, subscriptions change, or invoices are generated. The app cannot update user state without them.

1. In Stripe Dashboard, go to **Developers → Webhooks → Add endpoint**.
2. Endpoint URL: `https://your-domain.com/api/stripe/webhook`
   - For local testing, use `http://localhost:9000/api/stripe/webhook` and forward events with `stripe listen --forward-to localhost:9000/api/stripe/webhook`
3. Select all of these events:

   | Category | Events |
   | :--- | :--- |
   | Checkout | `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired` |
   | Subscriptions | `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`, `customer.subscription.trial_will_end`, `customer.subscription.pending_update_applied`, `customer.subscription.pending_update_expired` |
   | Invoices | `invoice.payment_failed`, `invoice.payment_action_required`, `invoice.payment_succeeded`, `invoice.paid`, `invoice.voided`, `invoice.marked_uncollectible` |
   | Customers | `customer.deleted` |

4. Click **Add endpoint**. Copy the **Signing secret** (starts with `whsec_`).
5. Update your `.env` file:
   ```env
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

### Step 4: Configure the Billing Portal

The Billing Portal is the Stripe-hosted page users reach when they click "Manage Subscription" in Settings. Without configuring it, the portal route fails.

1. In Stripe Dashboard, go to **Settings → Billing → Customer portal**.
2. Enable these features at minimum:
   - Update payment methods
   - Cancel subscriptions
   - View billing history
3. Add your business name and support email under **Business information**.
4. Click **Save**.

> [!NOTE]
> Portal configuration is separate for test mode and live mode. You need to configure it in both.

### Step 5: Map price IDs into the plan documents

After `npm run db:init`, all plans have `stripePriceId: ''`. **No checkout will succeed until you fill these in.** The checkout route returns HTTP 400 for any plan with an empty price ID, and the pricing page shows a configuration warning instead of plan cards.

1. Start the app and log in with your admin account.
2. Go to `/admin/plans`.
3. Click **Edit** on the **Standard** plan and paste in:
   - `stripePriceId` — the fixed monthly base price ID
   - `stripeStoragePriceId` — the metered storage price ID
   - `stripeTranscriptionPriceId` — the metered transcription price ID
4. Click **Save**. Repeat for **Pro** and **Lifetime**.

After saving, the plans will appear on the public pricing page and checkout will work.

### Step 6: Go live

When you are ready to accept real payments, switch to Stripe live mode:

1. In Stripe Dashboard, switch to **Live Mode** (toggle at top right).
2. Go to **Developers → API keys** and copy your live **Secret key** (starts with `sk_live_`).
3. Repeat Steps 1–4 in live mode:
   - Create the two meters (same event names)
   - Create products and prices with your real pricing
   - Register the live webhook endpoint pointing to your production URL
   - Configure the Billing Portal
4. Update your `.env` file:
   ```env
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_WEBHOOK_SECRET=whsec_...   # the signing secret from the LIVE webhook endpoint
   ```
5. Go to `/admin/plans` and update the price IDs with the live Price IDs.
6. Deploy. Verify by completing a test purchase using a real card in live mode.

> [!WARNING]
> Make sure `STRIPE_WEBHOOK_SECRET` is updated to the live endpoint's signing secret, not the test endpoint's. Using the wrong secret causes all webhook signature verifications to fail silently, breaking subscription state updates.

---

## How Checkout Works

**Relevant code:** `src/app/api/stripe/checkout/route.ts`

1. The user selects a plan and the frontend calls `POST /api/stripe/checkout` with the `planKey` or `priceId`.
2. The route authenticates the user and looks up the plan in MongoDB.
3. It checks the plan's `stripePriceId` is non-empty and the Stripe price is active.
4. It blocks duplicate subscriptions: if the user already has an `active`, `trialing`, `past_due`, `unpaid`, or `incomplete` subscription, it returns a 409.
5. It creates a Stripe Customer for the user if one doesn't exist yet (with optimistic locking to prevent duplicates).
6. It determines checkout `mode` from the price type: `recurring` → `subscription`, `one_time` → `payment`.
7. It creates a Stripe Checkout Session and returns the session URL. The frontend redirects to Stripe.

**What happens after checkout:**
- Stripe fires `checkout.session.completed` to the webhook.
- For subscription mode: the webhook calls `syncSubscription()`, which retrieves the subscription, finds the matching plan, and updates the user document.
- The self-healing logic in `syncSubscription()` also checks that metered prices (storage and transcription) are attached to the subscription. If they are missing, it adds them automatically.
- For payment mode (Lifetime): the webhook calls `applyOneTimeCheckoutPlan()`, which upgrades the user's plan and creates a new usage-only subscription for metered billing.

---

## Webhook Processing

**Endpoint:** `POST /api/stripe/webhook`

All webhook events are processed idempotently through the `stripe_webhook_events` MongoDB collection. Before processing any event, the handler claims it with a status of `processing`. If the same event ID arrives again, it returns `200` immediately without re-processing. Stale `processing` records (older than 10 minutes) can be retaken.

The handler processes these event types:

| Event | Action |
| :--- | :--- |
| `checkout.session.completed` | Links customer to user, syncs subscription or applies one-time plan |
| `checkout.session.async_payment_succeeded` | Same as completed |
| `checkout.session.async_payment_failed` | Sends in-app payment failure notification |
| `checkout.session.expired` | Sends in-app checkout expired notification |
| `customer.subscription.created/updated/deleted/paused/resumed` | Calls `syncSubscription()`, sends relevant in-app notification |
| `customer.subscription.pending_update_applied/expired` | Calls `syncSubscription()`, notifies on expired updates |
| `customer.subscription.trial_will_end` | Sends trial ending soon notification |
| `invoice.payment_failed` / `invoice.payment_action_required` | Syncs subscription status (becomes `past_due`), sends payment failure notification |
| `invoice.payment_succeeded` / `invoice.paid` | Syncs subscription (resets to `active`) |
| `invoice.voided` / `invoice.marked_uncollectible` | Syncs subscription |
| `customer.deleted` | Removes all Stripe fields from user document, sends warning notification |

---

## Access Control

The billing status on the user document gates uploads and transcription:

| Status | Uploads | Transcription | Notes |
| :--- | :--- | :--- | :--- |
| No subscription (trial active) | Allowed within trial limits | Allowed within trial limits | |
| Trial expired | Blocked | Blocked | Prompts to upgrade |
| `active` | Allowed (within plan limits or overage) | Allowed (within plan limits or overage) | |
| `trialing` | Allowed within plan limits | Allowed within plan limits | |
| `past_due` | Blocked | Blocked | Prompts to update payment method |
| `unpaid` | Blocked | Blocked | |
| `canceled` (within period) | Allowed until `stripeCurrentPeriodEnd` | Allowed until `stripeCurrentPeriodEnd` | Grace period |
| `canceled` (past period) | Blocked | Blocked | |
| `paused` | Blocked | Blocked | |

Overage billing (`billingSettings.allowOverage = true`) allows usage beyond the plan limits by emitting metered Stripe events. Without overage enabled, exceeding the plan limit blocks the action.

---

## Billing Portal and Invoice History

**Portal:** `POST /api/stripe/portal`
- Creates a Stripe Billing Portal session for the authenticated user.
- Creates a Stripe Customer on demand if the user does not yet have one.
- Returns a redirect URL to the Stripe-hosted portal.

**Invoices:** `GET /api/stripe/invoices`
- Lists invoices for the user's `stripeCustomerId`.
- Returns a maximum of 50 invoices.
- Includes Stripe's hosted invoice URL for PDF download.

---

## Local Testing

```bash
# Forward Stripe events to your local server
stripe listen --forward-to localhost:9000/api/stripe/webhook

# Trigger a specific event manually
stripe trigger checkout.session.completed
```

Useful test cards:

| Card | Behavior |
| :--- | :--- |
| `4242 4242 4242 4242` | Always succeeds |
| `4000 0000 0000 0002` | Always declines |
| `4000 0000 0000 0341` | Succeeds but then payment fails on next invoice |
| `4000 0025 0000 3155` | Requires 3DS authentication |

---

## Validation Checklist

After completing the Stripe setup, verify each of the following:

- [ ] Pricing page shows plan cards (not a configuration warning)
- [ ] Clicking a plan opens Stripe Checkout in test mode
- [ ] Completing a test checkout (card `4242 4242 4242 4242`) upgrades the user's plan in the app
- [ ] Billing Portal opens when clicking "Manage Subscription" in Settings
- [ ] Invoice history appears in Settings after a successful checkout
- [ ] Overage disabled: uploading beyond the plan limit is blocked
- [ ] Overage enabled: uploading beyond the plan limit succeeds and a `storage_usage_bytes` meter event appears in Stripe Dashboard → Billing → Meters
- [ ] ElevenLabs transcription usage reflects the configured multiplier in `transcriptionUsed`
- [ ] Webhook retries do not create duplicate subscription updates (check `stripe_webhook_events` collection)
- [ ] `customer.deleted` in Stripe clears Stripe fields from the user document

---

## Troubleshooting

| Symptom | Likely cause |
| :--- | :--- |
| Pricing page shows a configuration warning instead of plan cards | All plans have `stripePriceId: ''`. Go to `/admin/plans` and set the price IDs. |
| Checkout returns "Invalid plan" (HTTP 400) | The plan is inactive, `stripePriceId` is empty, or the Stripe price is no longer active. |
| Checkout returns "You already have an active subscription" | Use the Billing Portal to cancel the existing subscription first. |
| Portal session creation fails | The Stripe Billing Portal has not been configured in the Stripe Dashboard (Settings → Billing → Customer portal). |
| Webhook signature verification fails | `STRIPE_WEBHOOK_SECRET` does not match the signing secret on the registered endpoint. Make sure you are using the live endpoint secret in production and the test endpoint secret locally. |
| Metered usage not appearing in Stripe | Either the meter event names do not match exactly (`storage_usage_bytes`, `transcription_usage_seconds`), or `billingSettings.allowOverage` is false for the user, or the user has no `stripeCustomerId`. |
| Storage bills are massively high | The `storage_usage_bytes` meter is set to Sum instead of Last. Recreate it with Last aggregation. |
| `billing.meterEvents` is undefined at runtime | The Stripe API version in `src/lib/stripe.ts` was changed away from the `.clover` preview version. Restore it to `2026-01-28.clover`. |
| Subscription state not updating after payment | The webhook endpoint is not registered or is returning errors. Check the Stripe Dashboard → Webhooks for failed deliveries. |
| `Pay Per Usage cannot be enabled on Free Trial` | The current plan key is `free-trial`. Only paid plan users can enable overage. |
| Duplicate billing concerns | Inspect the `stripe_webhook_events` collection for duplicate events. Check the `transcriptionUsageReportedAt` field on recordings for duplicate transcription billing. |
