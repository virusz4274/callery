# Stripe Billing Integration Test Plan

This document outlines manual tests to verify all billing features work correctly in your sandbox environment.

## Prerequisites

- [ ] Stripe CLI running: `stripe listen --forward-to localhost:9002/api/stripe/webhook`
- [ ] Dev server running: `npm run dev`
- [ ] Admin Panel configured with Price IDs (see previous steps)
- [ ] Test card numbers ready (see Stripe docs)

---

## Test 1: New User Signup (Free Trial)

**Goal**: Verify new users start on Free Trial with correct limits.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1.1 | Create a new account | User created in DB |
| 1.2 | Check Dashboard | See "Free Trial" plan, 30-day countdown |
| 1.3 | Upload a file (50MB) | Upload succeeds |
| 1.4 | Check usage bar | Storage shows ~50MB used |
| 1.5 | Try uploading 100MB+ | Should be blocked (limit exceeded) |

---

## Test 2: Subscribe to Standard Plan

**Goal**: Verify Stripe Checkout and subscription sync.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 2.1 | Click "Upgrade" on pricing page | Redirects to Stripe Checkout |
| 2.2 | Complete payment with `4242 4242 4242 4242` | Checkout success |
| 2.3 | Check CLI terminal | Webhooks fired: `checkout.session.completed`, `customer.subscription.created` |
| 2.4 | Check user in DB | `plan: "Standard"`, `stripeSubscriptionStatus: "active"` |
| 2.5 | Check Dashboard | Plan shows "Standard", limits updated (2GB storage) |

---

## Test 3: Metered Storage Usage

**Goal**: Verify storage uploads report peak stored bytes to Stripe (Last aggregation).

| Step | Action | Expected Result |
|------|--------|-----------------|
| 3.1 | Ensure user is on Standard with PayPerUsage OFF | User blocked at 2GB |
| 3.2 | Enable PayPerUsage in settings | Toggle enabled |
| 3.3 | Upload files totaling 3GB | Upload succeeds (overage allowed) |
| 3.4 | Check Stripe Dashboard → Billing → Meters → Storage | Meter shows latest peak value |
| 3.5 | Check CLI for `billing.meter_event.created` | Event visible (`storage_usage_bytes`) |

---

## Test 4: Metered Transcription Usage

**Goal**: Verify transcription usage reports correctly.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 4.1 | Upload an audio file (e.g., 2 min) | File uploaded |
| 4.2 | Wait for auto-transcription to complete | Transcription status: "completed" |
| 4.3 | Check Stripe Dashboard → Meters → Transcription | Usage event logged (seconds, rounded to 15s blocks) |
| 4.4 | Check user's transcription usage in app | Counter increased |

---

## Test 4b: Multiplier Transcription (ElevenLabs)

**Goal**: Verify ElevenLabs usage is billed at 6x.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 4b.1 | Switch default provider to ElevenLabs in code or Admin | Provider set |
| 4b.2 | Upload a 1-minute audio file | Upload succeeds |
| 4b.3 | Wait for processing | Status: "completed" |
| 4b.4 | Check Stripe Meters | Event value: **360** (60s * 6) |
| 4b.5 | Check User Usage | Transcription Used += 360s |

---

## Test 5: Billing Threshold ($10 Auto-Invoice)

**Goal**: Verify automatic invoicing when usage exceeds $10.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 5.1 | Set Storage Price to $1/GB for testing (or use high volume) | Price updated |
| 5.2 | Upload 15GB of files | Should trigger $15 worth of usage |
| 5.3 | Check Stripe Dashboard → Invoices | New invoice created automatically (not waiting for month end) |
| 5.4 | Check CLI for `invoice.created`, `invoice.finalized` | Webhooks visible |

> [!TIP]
> To speed this up, you can manually report usage via CLI:
> ```bash
> stripe billing meter_events create \
>   --event_name=storage_usage_bytes \
>   --payload[stripe_customer_id]=cus_XXXXX \
>   --payload[value]=1000000000
> ```

---

## Test 6: Delete Storage (Peak Remains)

**Goal**: Verify deleting files reduces in-app usage but does **not** reduce Stripe usage.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 6.1 | Note current storage usage in Stripe Meters | e.g., 5GB |
| 6.2 | Delete 2GB worth of recordings in app | Files deleted |
| 6.3 | Check Stripe Dashboard → Meters → Storage | Usage does **not** decrease (peak remains) |
| 6.4 | Check UI usage bars | Storage used decreases in app |

---

## Test 6b: New Billing Period Baseline

**Goal**: Verify a baseline storage event is sent when a new billing period starts.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 6b.1 | Note current stored bytes in DB | e.g., 8GB |
| 6b.2 | Wait for period rollover (Stripe test clock) | `customer.subscription.updated` webhook fires |
| 6b.3 | Check Stripe Meters → Storage | New event logged with current stored bytes |

---

## Test 7: Plan Upgrade (Standard → Pro)

**Goal**: Verify plan changes via Stripe Portal.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 7.1 | Go to Settings → Manage Subscription | Redirects to Stripe Portal |
| 7.2 | Switch to Pro plan | Proration calculated, payment processed |
| 7.3 | Check CLI for webhooks | `customer.subscription.updated` |
| 7.4 | Check user DB | `plan: "Pro"`, limits updated (5GB) |
| 7.5 | Check Stripe subscription items | Metered items still attached (storage/transcription) |

---

## Test 8: Plan Cancellation

**Goal**: Verify cancellation behavior.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 8.1 | Go to Stripe Portal → Cancel subscription | Cancellation scheduled |
| 8.2 | Check user DB | `stripeSubscriptionStatus: "canceled"`, `stripeCurrentPeriodEnd` still in future |
| 8.3 | Try uploading file | Should still work (period not ended) |
| 8.4 | Simulate period end (Stripe test clock or wait) | Access restricted |

---

## Test 9: Payment Failure

**Goal**: Verify failed payments block access.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 9.1 | Change payment method to `4000 0000 0000 0341` (always declines) | Card saved |
| 9.2 | Trigger invoice (end of billing cycle or manual) | Payment fails |
| 9.3 | Check CLI for `invoice.payment_failed` | Webhook received |
| 9.4 | Check user DB | `stripeSubscriptionStatus: "past_due"` |
| 9.5 | Try uploading file | Should be blocked with "Payment failed" message |
| 9.6 | Check Dashboard | Red banner: "Your payment failed" |

---

## Test 10: Lifetime Plan (Pure Metered)

**Goal**: Verify Lifetime users have no base limits.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 10.1 | Subscribe to Lifetime plan ($299 one-time) | Payment success |
| 10.2 | Check DB | `plan: "Lifetime"`, `billingSettings.allowOverage: true` |
| 10.3 | Check limits | `storageAllocation: 0`, `transcriptionAllocation: 0` |
| 10.4 | Upload file | Allowed (metered billing active) |
| 10.5 | Check Stripe Meters | Usage logged |

---

## Test 11: Admin Panel - Plan Management

**Goal**: Verify Admin Panel correctly updates plans.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 11.1 | Log in as Admin | Access `/admin` |
| 11.2 | Go to `/admin/plans` | See list of plans |
| 11.3 | Edit Pro plan: Change Stripe Price ID | Save succeeds |
| 11.4 | Check MongoDB | Plan document updated |
| 11.5 | Run `npx tsx src/lib/db/init.ts` | Confirm it does NOT overwrite the change |

---

## Test 12: Billing Disabled (Self-Hosted Mode)

**Goal**: Verify app works when billing is disabled.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 12.1 | Set `NEXT_PUBLIC_ENABLE_BILLING=false` in [.env](file:///home/virusz4274/call-memo/.env) | Restart dev server |
| 12.2 | Upload file | Allowed (no limits enforced) |
| 12.3 | Check for Stripe errors | None (all calls skipped) |
| 12.4 | Check UI | No billing alerts, no upgrade buttons |

---

## Stripe Test Cards Reference

| Scenario | Card Number |
|----------|-------------|
| Success | `4242 4242 4242 4242` |
| Requires Auth | `4000 0025 0000 3155` |
| Declined | `4000 0000 0000 0002` |
| Insufficient Funds | `4000 0000 0000 9995` |
| Always Fails on Charge | `4000 0000 0000 0341` |

---

## Useful CLI Commands

```bash
# List all meters
stripe billing meters list

# Manually report usage
stripe billing meter_events create \
  --event_name=storage_usage_bytes \
  --payload[stripe_customer_id]=cus_XXXXX \
  --payload[value]=1000000000

# List subscriptions for a customer
stripe subscriptions list --customer=cus_XXXXX

# Trigger test webhook events
stripe trigger invoice.payment_failed
stripe trigger customer.subscription.deleted
```
