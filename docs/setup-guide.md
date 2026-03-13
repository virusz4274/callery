# Setup Guide

This guide is for getting Call Memo running locally or handing it to a new operator without reverse-engineering the current codebase.

## What This Covers

- Local development setup
- Required and optional environment variables
- Firebase, Google Contacts OAuth, Cloudflare R2, Gemini, Soniox, ElevenLabs, Stripe, push, and SMTP setup
- Webhook and cron configuration
- Verification steps for a healthy install

## 1. Prerequisites

Install locally:

- Node.js 20+
- npm
- MongoDB 6+ or MongoDB Atlas
- Git

Accounts and services used by the app:

- Firebase and Google Cloud for authentication and Google Contacts sync
- Cloudflare R2 for audio storage and exports
- Gemini for summaries, transliteration, and embeddings
- Soniox and/or ElevenLabs for transcription
- Stripe for subscriptions and metered usage
- Web Push VAPID keys for in-app/browser notifications
- SMTP provider for support email delivery

## 2. Install The Project

```bash
git clone <repo-url>
cd call-memo
npm install
```

## 3. Required App Configuration

There is no committed `.env.example`, so create `.env` manually in the repo root.

### Minimum variables for the app to boot

```env
NEXT_PUBLIC_APP_URL=http://localhost:9000
MONGODB_URI=mongodb://localhost:27017/call-memo

NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...

# Choose one Firebase Admin approach:
# 1) service-account.json in repo root
# 2) full JSON string below
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}

R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=...

UPLOAD_SESSION_SECRET=...
SHARE_LINK_SECRET=...
```

Notes:

- `UPLOAD_SESSION_SECRET` secures upload finalization tokens.
- `SHARE_LINK_SECRET` secures public share links.
- `NEXTAUTH_SECRET` is only a legacy fallback in parts of the codebase and should not be your primary setting.

### Strongly recommended optional variables

```env
# AI
GOOGLE_GENERATIVE_AI_API_KEY=...
GEMINI_API_KEY=... # legacy fallback, optional
GEMINI_MODEL_SUMMARY=gemini-2.0-flash-lite-preview-02-05
GEMINI_MODEL_TRANSLITERATION=gemini-2.0-flash-lite-preview-02-05

# Webhooks / cron / retention
CRON_SECRET=...
EXPORT_JOB_STALE_MINUTES=90
EXPORT_INLINE_PROCESSING=false
SOFT_DELETE_RESTORE_DAYS=30

# UI toggles
NEXT_PUBLIC_ENABLE_BILLING=true
NEXT_PUBLIC_SHOW_MOBILE_BURGER_MENU=false
```

### Optional integration variables

```env
# Google Contacts OAuth
NEXT_PUBLIC_GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_ID=... # optional alternative source
GOOGLE_CLIENT_SECRET=...
NEXT_PUBLIC_GOOGLE_REDIRECT_URI=http://localhost:9000/api/auth/google/callback

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

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Web Push
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_CONTACT_EMAIL=admin@example.com

# Email / support
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM="Call Memo <no-reply@example.com>"
SUPPORT_EMAIL=support@example.com

# Atlas DNS fallback, only if needed
MONGODB_DNS_SERVERS=8.8.8.8,1.1.1.1
```

## 4. Firebase Setup

Firebase is used for client auth, session verification, and user identity.

### 4.1 Create the Firebase project

1. Open [Firebase Console](https://console.firebase.google.com/).
2. Create a project.
3. Add a web app and copy the web config values into `.env`.

### 4.2 Enable sign-in methods

In Firebase Console:

1. Go to `Authentication`.
2. Enable `Email/Password`.
3. Enable `Google` if you want Google sign-in on `/login` and `/signup`.

### 4.3 Create a Firebase Admin service account

1. Open `Project settings` -> `Service accounts`.
2. Generate a private key.
3. Either:
   - store it as `service-account.json` in the repo root for local development, or
   - paste the JSON into `FIREBASE_SERVICE_ACCOUNT`.

Do not commit real secrets.

## 5. Google Contacts OAuth Setup

Google Contacts sync is separate from Firebase sign-in. It uses Google People API and the callback route `/api/auth/google/callback`.

1. Open [Google Cloud Console](https://console.cloud.google.com/) for the same project.
2. Enable `Google People API`.
3. Configure the OAuth consent screen.
4. Add the scope:
   - `https://www.googleapis.com/auth/contacts.readonly`
5. Create an OAuth client ID for a web application.
6. Add redirect URIs:
   - Local: `http://localhost:9000/api/auth/google/callback`
   - Production: `https://<your-domain>/api/auth/google/callback`
7. Copy the client ID and secret into `.env`.

## 6. Cloudflare R2 Setup

R2 stores uploaded recordings and generated export archives.

1. Create an R2 bucket.
2. Create API credentials with read/write access.
3. Copy endpoint, access key, secret key, and bucket name into `.env`.
4. Add a lifecycle rule for export archives if you want automatic cleanup:
   - Prefix: `exports/`
   - Action: delete objects after 7 days

### Required R2 CORS policy

The upload flow sends file bytes directly from the client to R2. Add a CORS policy like this:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:9000",
      "https://<your-domain>"
    ],
    "AllowedMethods": [
      "PUT",
      "GET",
      "HEAD"
    ],
    "AllowedHeaders": [
      "Content-Type"
    ],
    "ExposeHeaders": [
      "ETag"
    ],
    "MaxAgeSeconds": 86400
  }
]
```

### Upload limits enforced by the app

- Upload limit: `5 GiB` per file
- Transcription limit: `2 GiB` per file

Files larger than `2 GiB` still upload and remain playable, but transcription is skipped or blocked.

## 7. AI And Transcription Providers

### Gemini

Gemini is used for:

- English call summaries
- Transliteration output
- Embeddings for semantic search

Preferred env var:

- `GOOGLE_GENERATIVE_AI_API_KEY`

Legacy fallback still supported:

- `GEMINI_API_KEY`

### Soniox and ElevenLabs

The app can use either provider as the default transcription engine. Users can pick a default provider in Settings -> Data.

Set whichever providers you plan to use:

- `SONIOX_*`
- `ELEVENLABS_*`

Each async provider also requires a webhook secret for callback verification.

## 8. Stripe Setup

Billing is optional. If you are not setting up Stripe yet, use:

```env
NEXT_PUBLIC_ENABLE_BILLING=false
```

If billing is enabled:

1. Create the base plan prices you want to sell.
2. Create two meters in Stripe:
   - `storage_usage_bytes`
   - `transcription_usage_seconds`
3. Create usage-based prices tied to those meters.
4. Configure the Stripe webhook endpoint:
   - `POST /api/stripe/webhook`
5. In `/admin/plans`, assign Stripe IDs to each plan document.

Full billing details live in [billing.md](billing.md).

## 9. Web Push Setup

Web push enables the in-app/browser notification opt-in flow.

Generate VAPID keys and set:

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_CONTACT_EMAIL`

If these are missing, the notification UI still renders, but push subscription and delivery will not work.

## 10. Support Email Setup

`POST /api/support` always saves messages to MongoDB. If `SUPPORT_EMAIL` is configured, the route also forwards support requests by email using the SMTP credentials in `.env`.

## 11. Initialize MongoDB And Run The App

Initialize collections, indexes, and seeded defaults:

```bash
npx tsx src/lib/db/init.ts
```

Then start development:

```bash
npm run dev
```

Local URL: `http://localhost:9000`

Re-run `npx tsx src/lib/db/init.ts` after backend or index changes, especially when new collections or webhook idempotency indexes are added.

## 12. Local Webhook Testing

### Soniox

- Endpoint: `POST /api/webhooks/soniox`
- Required header: `X-Soniox-Secret`

### ElevenLabs

- Endpoint: `POST /api/webhooks/elevenlabs`
- Required signature: `ElevenLabs-Signature`

### Stripe

Use the Stripe CLI locally:

```bash
stripe listen --forward-to localhost:9000/api/stripe/webhook
```

Register these Stripe event types:

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

## 13. Production Cron Configuration

The app exposes two protected cron routes:

- `GET /api/cron/process-exports`
- `GET /api/cron/cleanup-recordings`

They require:

```http
Authorization: Bearer <CRON_SECRET>
```

`vercel.json` currently schedules:

- `/api/cron/process-exports` every 5 minutes
- `/api/cron/cleanup-recordings` daily at `03:00 UTC`

## 14. Verification Checklist

Confirm these before calling the setup healthy:

1. Sign up works with email/password.
2. Google sign-in works if enabled.
3. Google Contacts sync completes if OAuth is configured.
4. Uploading a recording stores the file in R2.
5. Playback works from the recordings workspace.
6. Transcription completes through the configured provider for files up to `2 GiB`.
7. Gemini summaries and semantic search work when Gemini is configured.
8. Sharing generates a public signed link.
9. Export jobs complete and produce a downloadable archive.
10. Notifications appear in the notification center.
11. Billing checkout and invoice history work if Stripe is enabled.
12. Support form submissions appear in MongoDB and forward by email if SMTP is configured.

## 15. Useful Commands

```bash
npm run dev
npm run lint
npm run typecheck
npm run build
npm run cap:sync
```
