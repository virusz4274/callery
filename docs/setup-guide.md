# Setup Guide

This guide documents the environment and service setup the current codebase expects.

## Prerequisites

- Node.js 20+
- npm
- MongoDB 6+ or MongoDB Atlas
- one Google Cloud project with Firebase enabled
- Cloudflare R2 bucket

Optional integrations:

- Google People API and OAuth clients in the same Google Cloud project
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
npm run db:init
```

Fresh-start workflow for a wiped environment:

1. Wipe MongoDB data.
2. Wipe R2 objects for the target bucket or prefix.
3. Run `npm run db:init`.
4. Start the app.
5. Sign in with an email listed in `ADMIN_BOOTSTRAP_EMAILS` to create the first admin profile.

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
NEXT_PUBLIC_GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
NEXT_PUBLIC_GOOGLE_REDIRECT_URI=...
ADMIN_BOOTSTRAP_EMAILS=admin@example.com
```

Notes:

- This app is designed around one Google Cloud project with Firebase enabled, not separate Firebase and Google API projects.
- Firebase Admin credentials can come from a local `service-account.json` file or `FIREBASE_SERVICE_ACCOUNT`.
- `GOOGLE_TOKEN_ENCRYPTION_KEY` is only required when Google Contacts sync is enabled.
- `ADMIN_BOOTSTRAP_EMAILS` is optional, but it is the supported way to mint the first admin account on a fresh database.

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
- `ADMIN_BOOTSTRAP_EMAILS=owner@example.com,ops@example.com`: first-login admin bootstrap allowlist

## Firebase Setup

Call Memo uses Firebase Auth on the client and Firebase Admin on the server. The supported deployment model is one Google Cloud project with Firebase enabled, with both app sign-in and Google API integrations configured inside that same project.

1. Create a Google Cloud project and enable Firebase on it.
2. Add a web app and copy the web config into `.env`.
3. Enable `Email/Password`.
4. Enable `Google` if you want Google sign-in on `/login` and `/signup`.
5. Add local and production origins to Firebase Auth authorized domains.
6. Register the Android app in the same Firebase project if you ship the APK.
7. Add the required Android SHA fingerprints in that same project.
8. Generate a Firebase Admin service account and either:
   - keep it in `service-account.json` locally, or
   - store the JSON in `FIREBASE_SERVICE_ACCOUNT`
9. Download the Android `google-services.json` file from the new Firebase project and replace `android/app/google-services.json` before building the APK.

If `FIREBASE_AUTH_HELPER_ORIGIN` or `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` is configured, Next.js rewrites `/__/auth/*` to Firebase’s auth helper endpoint.

## Google Contacts Setup

Google Contacts sync is separate from Firebase sign-in, but it should be configured inside the same Google Cloud project.

1. Enable `Google People API` in the same Google Cloud project used for Firebase.
2. Configure the OAuth consent screen.
3. Create a web OAuth client.
4. Add redirect URIs:
   - `http://localhost:9000/api/auth/google/callback`
   - `https://<your-domain>/api/auth/google/callback`
5. Add `https://www.googleapis.com/auth/contacts.readonly`.
6. Set:

```env
NEXT_PUBLIC_GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
NEXT_PUBLIC_GOOGLE_REDIRECT_URI=http://localhost:9000/api/auth/google/callback
GOOGLE_TOKEN_ENCRYPTION_KEY=...
# GOOGLE_TOKEN_ENCRYPTION_KEY_VERSION=v1
```

The Google refresh token is encrypted before it is stored on the user document. Without `GOOGLE_TOKEN_ENCRYPTION_KEY`, the connect flow can authenticate but the sync state cannot be saved safely.

## Fresh Firebase Cutover

Use this sequence when replacing the old Firebase project entirely:

1. Create the new Google Cloud project.
2. Enable Firebase on that project.
3. Create the Firebase web app and collect the new client config.
4. Enable Firebase Auth with `Email/Password` and `Google`.
5. Add the production domain to Firebase authorized domains.
6. Register the Android package and add SHA fingerprints in that same project.
7. Download and replace `android/app/google-services.json` from the new Firebase project if Android builds are in scope.
8. Create the Firebase Admin service account for server verification.
9. Enable Google People API in the same project.
10. Configure the OAuth consent screen and create the Contacts-sync OAuth web client.
11. Replace the local `.env` values with the new project config.
12. Wipe MongoDB and R2.
13. Run `npm run db:init`.
14. Set `ADMIN_BOOTSTRAP_EMAILS`.
15. Sign in with the bootstrap admin account and verify the first admin user is created.

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

If billing or admin pages fail with missing seed-data errors, rerun `npm run db:init` before debugging application code. The app now expects `plans` and `system_settings` to exist instead of inventing runtime defaults.

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
