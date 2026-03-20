# Setup Guide

This guide documents the environment and service setup the current codebase expects.

## Prerequisites

- Node.js 20+
- npm
- MongoDB 6+ or MongoDB Atlas
- Firebase project
- Cloudflare R2 bucket

Optional integrations:

- Google Cloud OAuth + Google People API
- Gemini
- Soniox
- ElevenLabs
- Stripe
- Web Push VAPID keys
- SMTP provider

## Install

```bash
git clone <repo-url>
cd call-memo
npm install
cp .env.example .env
```

The tracked [.env.example](../.env.example) file is the canonical starting point. Fill in `.env` for your local or hosted environment, then initialize MongoDB:

```bash
npx tsx src/lib/db/init.ts
```

## Required Environment Variables

Minimum values for the app to boot and accept uploads:

```env
NEXT_PUBLIC_APP_URL=http://localhost:9000
MONGODB_URI=mongodb://localhost:27017/call-memo

NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID=...

R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=...

UPLOAD_SESSION_SECRET=...
SHARE_LINK_SECRET=...
```

Notes:

- `APP_URL` is an optional server-side alias for `NEXT_PUBLIC_APP_URL`. The public URL helpers will use `APP_URL` first when it is present.
- Firebase Admin credentials can come from a local `service-account.json` file or `FIREBASE_SERVICE_ACCOUNT`.
- `GOOGLE_TOKEN_ENCRYPTION_KEY` is only required when Google Contacts sync is enabled.
- `NEXTAUTH_SECRET` is only a legacy fallback for some token helpers and should not be the primary secret.

## Recommended Variables

```env
NEXT_PUBLIC_ENABLE_BILLING=false
NEXT_PUBLIC_SHOW_MOBILE_BURGER_MENU=false

GEMINI_MODEL_SUMMARY=gemini-2.0-flash-lite-preview-02-05
GEMINI_MODEL_TRANSLITERATION=gemini-2.0-flash-lite-preview-02-05

EXPORT_JOB_STALE_MINUTES=90
EXPORT_INLINE_PROCESSING=false
SOFT_DELETE_RESTORE_DAYS=30
```

Useful optional settings read by the current code:

- `FIREBASE_AUTH_HELPER_ORIGIN`: explicit rewrite target for `/__/auth/*`
- `CSP_REPORT_ONLY=true`: enables `Content-Security-Policy-Report-Only` instead of enforcement
- `MONGODB_CONNECTION_MODE=fallback-first`: skips the SRV-first attempt for Atlas DNS trouble
- `MONGODB_DNS_SERVERS=8.8.8.8,1.1.1.1`: custom DNS resolvers for the Mongo fallback path
- `MOBILE_SYNC_SESSION_SECRET`: optional dedicated signing secret for Android mobile sync tokens; if omitted, the app falls back to the upload/share secret chain

## Firebase Setup

Call Memo uses Firebase Auth on the client and Firebase Admin on the server.

1. Create a Firebase project.
2. Add a web app and copy the web config into `.env`.
3. Enable `Email/Password`.
4. Enable `Google` if you want Google sign-in on `/login` and `/signup`.
5. Add local and production origins to Firebase Auth authorized domains.
6. Generate a Firebase Admin service account and either:
   - keep it in `service-account.json` locally, or
   - store the JSON in `FIREBASE_SERVICE_ACCOUNT`

If `FIREBASE_AUTH_HELPER_ORIGIN` or `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` is configured, Next.js rewrites `/__/auth/*` to Firebase’s auth helper endpoint.

## Google Contacts Setup

Google Contacts sync is separate from Firebase sign-in.

1. Enable `Google People API` in Google Cloud.
2. Configure the OAuth consent screen.
3. Create a web OAuth client.
4. Add redirect URIs:
   - `http://localhost:9000/api/auth/google/callback`
   - `https://<your-domain>/api/auth/google/callback`
5. Add `https://www.googleapis.com/auth/contacts.readonly`.
6. Set:

```env
NEXT_PUBLIC_GOOGLE_CLIENT_ID=...
# GOOGLE_CLIENT_ID=...  # optional server-side alias
GOOGLE_CLIENT_SECRET=...
NEXT_PUBLIC_GOOGLE_REDIRECT_URI=http://localhost:9000/api/auth/google/callback
GOOGLE_TOKEN_ENCRYPTION_KEY=...
# GOOGLE_TOKEN_ENCRYPTION_KEY_VERSION=v1
```

The Google refresh token is encrypted before it is stored on the user document. Without `GOOGLE_TOKEN_ENCRYPTION_KEY`, the connect flow can authenticate but the sync state cannot be saved safely.

## Cloudflare R2 Setup

The app uploads media directly from the client to R2 using signed `PUT` URLs, then finalizes metadata server-side.

Required settings:

```env
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=...
```

Recommended CORS policy:

```json
[
  {
    "AllowedOrigins": ["http://localhost:9000", "https://<your-domain>"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 86400
  }
]
```

The current uploader accepts `mp3`, `wav`, `m4a`, `mp4`, and `webm`. Files can be up to `5 GiB`; transcription is blocked for files over `2 GiB`.

## AI And Transcription Providers

Gemini powers summaries, transliteration, and embeddings:

```env
GOOGLE_GENERATIVE_AI_API_KEY=...
GEMINI_MODEL_SUMMARY=gemini-2.0-flash-lite-preview-02-05
GEMINI_MODEL_TRANSLITERATION=gemini-2.0-flash-lite-preview-02-05
```

Soniox:

```env
SONIOX_API_KEY=...
SONIOX_API_BASE_URL=https://api.soniox.com
SONIOX_MODEL_ID=stt-async-v3
SONIOX_WEBHOOK_SECRET=...
```

ElevenLabs:

```env
ELEVENLABS_API_KEY=...
ELEVENLABS_API_BASE_URL=https://api.elevenlabs.io
ELEVENLABS_MODEL_ID=scribe_v2
ELEVENLABS_WEBHOOK_SECRET=...
```

Notes:

- Soniox and ElevenLabs are optional and can be enabled independently.
- Manual and auto transcription switch to provider async webhook mode for recordings over `300 seconds` (`5 minutes`).
- Auto-transcription is queued through the `async_jobs` collection.

## Billing Setup

Billing is disabled unless you set:

```env
NEXT_PUBLIC_ENABLE_BILLING=true
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

See [billing.md](billing.md) for the full Stripe setup. At a minimum you need:

- Stripe prices that map to the `plans` collection
- Stripe meters named `storage_usage_bytes` and `transcription_usage_seconds`
- a webhook endpoint pointed at `/api/stripe/webhook`

## Web Push And Support Email

Web Push:

```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_CONTACT_EMAIL=admin@example.com
```

SMTP-backed support delivery:

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM="Call Memo <no-reply@example.com>"
SUPPORT_EMAIL=support@example.com
```

Support requests are always stored in MongoDB. When `SUPPORT_EMAIL` is set, the app also queues a `support_email` async job.

## Cron Routes

The current codebase exposes three cron endpoints:

- `GET /api/cron/process-exports`
- `GET /api/cron/process-async-jobs`
- `GET /api/cron/cleanup-recordings`

All three require:

```http
Authorization: Bearer <CRON_SECRET>
```

Use:

```env
CRON_SECRET=...
```

`startExport()` can process inline in development or when `EXPORT_INLINE_PROCESSING=true`, but production should use the cron route.
`GET /api/cron/process-async-jobs` drains auto-transcription, Google Contacts sync, and support-email jobs from `async_jobs`.

## Webhooks

Configure these endpoints only for providers you actually use:

- `POST /api/stripe/webhook`
- `POST /api/webhooks/soniox`
- `POST /api/webhooks/elevenlabs`

Security:

- Stripe uses `STRIPE_WEBHOOK_SECRET`
- Soniox expects `X-Soniox-Secret`
- ElevenLabs expects a valid `ElevenLabs-Signature`

## Android Notes

The Android wrapper loads the hosted app rather than bundling the full UI locally. Before testing on a device:

1. Set the development `devUrl` in [capacitor.config.ts](../capacitor.config.ts) to a reachable LAN IP.
2. Run `npm run dev`.
3. Run `npm run cap:sync`.

The Android-only sync flow also uses:

- `POST /api/mobile/sync-session`
- `POST /api/mobile/direct-upload/init`
- `POST /api/mobile/direct-upload/complete`

The sync session token returned by `/api/mobile/sync-session` is currently valid for `24 hours`.

## Verification Checklist

Run these before handing the environment to someone else:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Then verify:

- login works with Firebase
- uploads can initialize and finalize against R2
- MongoDB init completed without index errors
- transcription providers and webhooks work when configured
- cron endpoints accept `CRON_SECRET`
- support requests create MongoDB records
