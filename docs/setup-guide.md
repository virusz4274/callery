# Setup Guide

This is the complete setup guide for handing this project to a new developer or operator.

## What This Covers

- Local app setup
- Firebase + Google Cloud + People API setup
- Cloudflare R2 setup
- AI/transcription setup (Gemini, Soniox, ElevenLabs)
- Stripe basics needed by the app
- Webhooks, cron jobs, and verification checklist

## 1. Prerequisites

Install locally:

- Node.js 20+
- npm
- MongoDB 6+ (or MongoDB Atlas)
- Git

Accounts you may need (depending on enabled features):

- Firebase / Google Cloud
- Cloudflare (R2)
- Stripe
- Soniox
- ElevenLabs
- SMTP provider

## 2. Install Project

```bash
git clone <repo-url>
cd call-memo
npm install
```

## 3. Firebase + Google Cloud Setup (Step-by-Step)

These steps are required for authentication and Google Contacts sync.

### 3.1 Create Firebase project

1. Go to [Firebase Console](https://console.firebase.google.com/).
2. Click `Add project`.
3. Create project (example name: `call-memo-app`).

### 3.2 Enable Google sign-in

1. Firebase Console -> `Build` -> `Authentication`.
2. Click `Get started`.
3. Open `Sign-in method`.
4. Enable `Google` provider.
5. Save.

### 3.3 Enable Google People API

1. Open [Google Cloud Console](https://console.cloud.google.com/) for the same project.
2. Go to `APIs & Services` -> `Library`.
3. Search `Google People API`.
4. Click `Enable`.

### 3.4 Configure OAuth consent screen

1. `APIs & Services` -> `OAuth consent screen`.
2. Choose `External` (unless using Workspace internal-only).
3. Fill app name and support email.
4. Add scope:
   - `https://www.googleapis.com/auth/contacts.readonly`
5. Add test users while app is in testing mode.

### 3.5 Create OAuth client credentials

1. `APIs & Services` -> `Credentials` -> `Create Credentials` -> `OAuth client ID`.
2. App type: `Web application`.
3. Add redirect URIs:
   - Local: `http://localhost:9000/api/auth/google/callback`
   - Prod: `https://<your-domain>/api/auth/google/callback`
4. Save and copy `Client ID` and `Client Secret`.

### 3.6 Create Firebase web app and copy client config

1. Firebase Console -> `Project settings` -> `General`.
2. Under `Your apps`, add `Web app`.
3. Copy firebase config values for `.env`.

### 3.7 Generate service account key

1. Firebase Console -> `Project settings` -> `Service accounts`.
2. Click `Generate new private key`.
3. Use one of:
   - Save as `service-account.json` in repo root
   - Put full JSON into `FIREBASE_SERVICE_ACCOUNT` env var

## 4. Cloudflare R2 Setup

1. In Cloudflare dashboard, create/select an R2 bucket.
2. Create R2 API credentials with read/write access.
3. Copy endpoint, access key, secret key, bucket name.
4. Recommended lifecycle rule:
   - Prefix: `exports/`
   - Action: Delete object
   - Age: 7 days

## 5. AI and Transcription Providers

Configure the providers you use:

- Gemini (`GOOGLE_GENERATIVE_AI_API_KEY`)
- Soniox (`SONIOX_API_KEY`, optional model/base URL override)
- ElevenLabs (`ELEVENLABS_API_KEY`, optional model/base URL override)

Webhook security for async transcription now requires both:

- `SONIOX_WEBHOOK_SECRET` (required)
- `ELEVENLABS_WEBHOOK_SECRET` (required)

## 6. Stripe Setup (Minimum)

Stripe detailed instructions live in [billing.md](billing.md). At minimum:

1. Create base prices for plans.
2. Create meters:
   - `storage_usage_bytes`
   - `transcription_usage_seconds`
3. Create metered prices for storage and transcription.
4. Set plan Stripe IDs in `/admin/plans`.
5. Configure webhook endpoint `/api/stripe/webhook`.
6. Enable all app-required Stripe webhook events (see Section 9).

## 7. Create `.env`

Create `.env` in repo root:

```env
# App
NEXT_PUBLIC_APP_URL=http://localhost:9000

# MongoDB
MONGODB_URI=mongodb://localhost:27017/call-memo

# Firebase (client)
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...

# Firebase (admin): choose one approach
# 1) service-account.json file in repo root
# 2) full JSON string below
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}

# Google Contacts OAuth
NEXT_PUBLIC_GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_ID=...            # optional alt source
GOOGLE_CLIENT_SECRET=...
NEXT_PUBLIC_GOOGLE_REDIRECT_URI=http://localhost:9000/api/auth/google/callback

# R2
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=...

# Sharing
SHARE_LINK_SECRET=...

# AI
GOOGLE_GENERATIVE_AI_API_KEY=...
GEMINI_MODEL_SUMMARY=gemini-2.0-flash-lite-preview-02-05
GEMINI_MODEL_TRANSLITERATION=gemini-2.0-flash-lite-preview-02-05

# Soniox
SONIOX_API_KEY=...
SONIOX_API_BASE_URL=https://api.soniox.com
SONIOX_MODEL_ID=stt-async-v3
SONIOX_WEBHOOK_SECRET=...

# ElevenLabs
ELEVENLABS_API_KEY=...
ELEVENLABS_API_BASE_URL=https://api.elevenlabs.io
ELEVENLABS_MODEL_ID=scribe_v2
ELEVENLABS_WEBHOOK_SECRET=...

# Billing
NEXT_PUBLIC_ENABLE_BILLING=true
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Cron/export worker
CRON_SECRET=...
EXPORT_JOB_STALE_MINUTES=90
EXPORT_INLINE_PROCESSING=false
SOFT_DELETE_RESTORE_DAYS=30

# Push notifications
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_CONTACT_EMAIL=admin@example.com

# Email/support
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM="Call Memo <no-reply@example.com>"
SUPPORT_EMAIL=support@example.com

# UI toggle
NEXT_PUBLIC_SHOW_MOBILE_BURGER_MENU=false
```

## 8. Initialize Database and Run

```bash
npx tsx src/lib/db/init.ts
npm run dev
```

App URL: `http://localhost:9000`

Notes:

- Run `npx tsx src/lib/db/init.ts` once during initial setup.
- Re-run it after pulling backend/index updates so new collections/indexes are applied (including webhook idempotency indexes).

## 9. Configure Webhooks for Local Testing

### Soniox

- Endpoint: `POST /api/webhooks/soniox`
- Authentication header: `X-Soniox-Secret` (must match `SONIOX_WEBHOOK_SECRET`).
- The app sends webhook URL + auth header per request when async transcription is started.

### ElevenLabs

- Endpoint: `POST /api/webhooks/elevenlabs`
- Configure this endpoint in ElevenLabs dashboard.
- Configure ElevenLabs webhook signing and set local `ELEVENLABS_WEBHOOK_SECRET` to the same signing secret.
- The app verifies `ElevenLabs-Signature` and rejects unsigned/invalid requests.
- For local testing, expose localhost via ngrok or similar.

### Generate webhook secrets

Use OpenSSL to generate strong secrets:

```bash
openssl rand -base64 48
```

Set output values in:

- `SONIOX_WEBHOOK_SECRET`
- `ELEVENLABS_WEBHOOK_SECRET`

### Stripe

Use Stripe CLI while testing locally:

```bash
stripe listen --forward-to localhost:9000/api/stripe/webhook
```

Register these event types for your Stripe webhook endpoint:

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

Notes:

- Stripe events are processed idempotently by event ID (`stripe_webhook_events` collection).
- Transcription webhooks (Soniox/ElevenLabs) are processed idempotently via `transcription_webhook_events`.
- Settings billing tab fetches customer invoice history from `GET /api/stripe/invoices`.

## 10. Configure Scheduled Jobs (Production)

Protected endpoints:

- `GET /api/cron/process-exports`
- `GET /api/cron/cleanup-recordings`

Both require:

```http
Authorization: Bearer <CRON_SECRET>
```

`vercel.json` already schedules:

- every 5 minutes: export processor
- daily at 03:00 UTC: cleanup job

## 11. Handover Verification Checklist

A new owner should verify these before going live:

1. Can log in via Firebase auth.
2. Can sync Google contacts.
3. Can upload and play a recording.
4. Soniox/ElevenLabs webhook completes transcription.
5. Gemini summary appears.
6. Export job runs and downloadable archive is produced.
7. Stripe checkout + webhook + plan sync works.
8. Cron jobs run with valid `CRON_SECRET`.
9. Support email endpoint works.
10. Backup owner has access to Firebase, GCP, Cloudflare, Stripe, and SMTP.

## 12. Useful Commands

```bash
npm run typecheck
npm run lint
npm run build
npm run cap:sync
```
