# API Reference

Callery uses Server Actions for most authenticated product behavior and route handlers for auth, webhooks, billing, mobile sync, support, and scheduled jobs.

## Server Actions

Primary action directories:

- `src/app/actions`
- `src/app/actions/admin`
- `src/app/actions/upload`

## Product Actions

### Recordings

File: `src/app/actions/recordings.ts`

`getRecordingsAction` accepts `page` (1-based), `limit`, and `search`, along with
archive, contact, date, and sort filters. The REST endpoint uses the same
pagination and search parameter names. The recordings page uses `q` in its
browser URL and passes that value as `search` to the action.

- `getRecordingsAction`
- `getRecordingDetailsAction`
- `getPlaybackUrlAction`
- `updateRecordingAction`
- `deleteRecordingAction`

### Upload

Files:

- `src/app/actions/upload/direct-upload.ts`
- `src/app/actions/upload/transcription.ts`
- `src/app/actions/upload/prepare-upload-context.ts`

Main browser flow:

1. `initializeDirectUpload`
2. client `PUT` to R2
3. `completeDirectUpload`
4. optional auto-transcription start with `after(...)`

### Search And Transcription

Files:

- `src/app/actions/search-actions.ts`
- `src/app/actions/transcription.ts`
- `src/app/actions/transcription-providers.ts`
- `src/app/actions/user-settings.ts`

Main actions:

- `searchRecordingsAction`
- `transcribeRecordingAction`
- `getAvailableProviders`
- `getProviderMultiplier`
- `updateTranscriptionSettings`

`searchRecordingsAction` also reports whether semantic search used Atlas vector search or fell back to keyword mode through `mode` and `fallbackReason`.

### Contacts And Google Sync

Files:

- `src/app/actions/google-auth.ts`
- `src/app/actions/save-contacts.ts`

Main actions:

- `getGoogleAuthUrl`
- `syncGoogleContacts`
- `saveContactsToMongoDB`

### Sharing, Stats, Export, Notifications, Plans

Files:

- `src/app/actions/sharing.ts`
- `src/app/actions/stats.ts`
- `src/app/actions/export.ts`
- `src/app/actions/notifications.ts`
- `src/app/actions/plans.ts`

Main actions:

- `createShareLink`
- `createShareLinkForClip`
- `getStatsAction`
- `startExport`
- `getExportStatus`
- `fetchNotifications`
- `readNotification`
- `readAllNotifications`
- `clearAllNotifications`
- `sendTestNotification`
- `getPublishedPlans`
- `getUpgradeablePlans`

## Admin Actions

Current admin action files:

- `src/app/actions/admin-health.ts`
- `src/app/actions/admin-settings.ts`
- `src/app/actions/admin-announcements.ts`
- `src/app/actions/admin-plans.ts`
- `src/app/actions/audit-log.ts`
- `src/app/actions/admin/stats.ts`
- `src/app/actions/admin/recordings.ts`
- `src/app/actions/admin/users.ts`
- `src/app/actions/admin/users/queries.ts`
- `src/app/actions/admin/users/mutations.ts`
- `src/app/actions/update-contact-plan.ts`
- `src/app/actions/delete-recordings.ts`

Main admin capabilities:

- health checks and incident clearing
- async job retry
- SMTP test email
- plan CRUD
- announcement CRUD
- system settings updates
- audit log retrieval
- user search, role changes, disable/restore, limits, usage edits, and deletion
- orphaned recording cleanup and bulk deletion

## Route Handlers

### Versioned integration API

The `/api/v1` recording API supports scoped API tokens, resumable and simple
uploads, status polling, downloads, and explicit transcription. See
[integration setup and examples](integration-api.md) and `/api/v1/openapi.json`.
Manage named credentials in Settings → Integrations. Existing routes below keep
their instance-session/mobile-token authentication contracts.

### Auth And User

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/auth/capabilities` | public googleEnabled, emailVerificationRequired, passwordResetEnabled; Cache-Control: no-store |
| `POST` | `/api/auth/sign-up/email` | email signup; no session when verification is required |
| `POST` | `/api/auth/sign-in/email` | email/password sign-in |
| `POST` | `/api/auth/sign-in/social` | starts optional Google login/signup |
| `GET` | `/api/auth/callback/google` | Better Auth Google identity callback |
| `GET` | `/api/auth/get-session` | resolves cookie or bearer session |
| `POST` | `/api/auth/sign-out` | revokes the current session |
| `GET` | `/api/auth/list-accounts` | linked login methods; credential accounts enable password changes |
| `POST` | `/api/auth/send-verification-email` | sends verification mail when email is configured |
| `GET` | `/api/auth/verify-email` | completes verification and verified admin bootstrap |
| `POST` | `/api/auth/change-password` | changes credential password and revokes other sessions |
| `POST` | `/api/auth/request-password-reset` | generic recovery request; disabled with EMAIL_PROVIDER=none |
| `POST` | `/api/auth/reset-password` | consumes recovery token and revokes all sessions |
| `GET` | `/api/auth/google/callback` | handles Google Contacts OAuth callback |
| `GET`, `PATCH` | `/api/user/profile` | reads or updates the current profile via cookie or bearer sessions |
| `POST` | `/api/user/ensure-profile` | ensures a MongoDB user exists for the current authenticated identity |
| `PATCH` | `/api/user/billing-settings` | toggles overage preferences and seeds the current storage baseline when enabled |
| `GET` | `/api/system-settings/public` | returns public maintenance-mode state |

### Product Data

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/contacts` | returns contacts for the current user |
| `POST` | `/api/contacts/sync` | runs a foreground Google Contacts refresh for the current user |
| `GET` | `/api/filesystem` | returns the storage/file tree for the current user |
| `GET` | `/api/recordings/[id]` | returns a single recording payload |
| `POST`, `DELETE` | `/api/notifications/subscribe` | registers or removes a browser push subscription |
| `POST` | `/api/support` | creates a support request and may send support email after the response |

### Billing

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `POST` | `/api/stripe/checkout` | creates a Stripe Checkout session |
| `POST` | `/api/stripe/portal` | creates a Stripe customer portal session |
| `GET` | `/api/stripe/invoices` | lists recent invoices for the current user |
| `POST` | `/api/stripe/webhook` | processes Stripe events idempotently |

Billing routes return `403` unless `NEXT_PUBLIC_ENABLE_BILLING=true`.

### Mobile Sync

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `POST` | `/api/mobile/sync-session` | creates a short-lived mobile sync token for the authenticated user |
| `POST` | `/api/mobile/direct-upload/init` | initializes client mobile direct upload |
| `POST` | `/api/mobile/direct-upload/complete` | finalizes client mobile direct upload |

Mobile upload routes authenticate with the sync token created by `/api/mobile/sync-session`. That token currently expires after `24 hours`.

### Webhooks

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `POST` | `/api/webhooks/soniox` | handles Soniox transcription callbacks |
| `POST` | `/api/webhooks/elevenlabs` | handles ElevenLabs transcription callbacks |

Security:

- Soniox expects `X-Soniox-Secret`
- ElevenLabs expects a valid `ElevenLabs-Signature`
- both providers persist idempotency state in `transcription_webhook_events`

### Cron

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/cron/process-exports` | processes pending export jobs |
| `GET` | `/api/cron/cleanup-recordings` | enforces cleanup and retention rules |

All cron routes require:

```http
Authorization: Bearer <CRON_SECRET>
```

## Public Signed Access

- `/s/[token]`: read-only shared recording page

This is a page route, not an API route.

## Current Upload Rules

- maximum upload size: `5 GiB`
- maximum transcription-eligible size: `2 GiB`
- supported upload formats: `mp3`, `wav`, `m4a`, `mp4`, `webm`
- direct upload URL lifetime: `15 minutes`

## Support Route Behavior

`POST /api/support` currently:

- validates the JSON body with `zod`
- rejects submissions that fill the honeypot `companyWebsite` field
- rejects cross-origin submissions that do not match the public app origin
- rate limits by client IP
- stores every accepted request in `support_messages`
- stores `pending` delivery state when `SUPPORT_EMAIL` is configured, otherwise `skipped`
- sends the support email after the response with Next.js `after(...)`

## Stripe Webhook Events

`POST /api/stripe/webhook` handles:

- checkout completion and async checkout outcomes
- checkout expiration notifications
- subscription create, update, pause, resume, delete, and pending-update lifecycle events
- invoice payment success and failure events
- `customer.deleted`

The webhook processor records state in `stripe_webhook_events`.

## Deployment authentication and retained APIs

Better Auth serves `/api/auth/*` for every deployment. Browser API requests send cookies through `authFetch`; other clients may send `Authorization: Bearer <session-token>`. The shared product APIs resolve either the instance's cookie or bearer session and reject disabled/deleted profiles.

`POST /api/mobile/sync-session` accepts instance-native cookie/bearer auth. The upload init/complete endpoints accept that identity or a limited sync token; upload completion tokens cannot be used for sync authentication.

`POST /api/transcribe` accepts `recordingId` and optional `provider`/`model`; configured providers are `soniox`, `elevenlabs`, `gemini` and `openai_compat`. Successful scheduling returns 202.

`GET /api/recordings` accepts `page`, `limit`, and `search` for owner-scoped search
with Atlas/regex fallback and inclusive full-day date filters.
`GET /api/recordings/[id]/play` returns a public-host signed playback URL.

`GET /api/health` checks process/database readiness. `GET /api/cron/process-usage` retries persisted managed meter events; see [scheduled jobs](cron-jobs.md).
