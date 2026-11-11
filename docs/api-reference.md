# API Reference

Callery uses Server Actions for most authenticated product behavior and route handlers for auth, webhooks, billing, mobile sync, support, and scheduled jobs.

This is the internal application reference. Third-party/mobile/CRM developers
should start at the public `/developers` hub and [Integration API](integration-api.md).
The deployed machine-readable contract is `/api/v1/openapi.json`; private browser
routes and Server Actions below are not public integration endpoints.

## Public integration interfaces

- `/api/v1` accepts scoped API keys and resource-bound OAuth access tokens.
- `POST /api/v1/recordings/search` calls the existing passage/keyword retrieval
  service and returns whitelisted recording DTOs, evidence, coverage, and app links.
- `GET /api/v1/recordings/[id]/transcript` provides revision-aware bounded pages.
- `/mcp/v1` exposes remote tools through stateless Streamable HTTP, backed by the
  same authorized services. Audio playback and manual uploads link to Callery.
- OAuth discovery, sign-in, consent, and connection management are distinct from
  Google sign-in/Contacts consent. See [platform setup](mcp-platforms.md).

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

The browser uses cookie-authenticated resumable routes:

- `POST /api/uploads` initializes/reuses an idempotent session.
- `GET /api/uploads/[id]` reconciles state and storage-confirmed parts.
- Part authorization and bounded part PUT routes transfer missing parts.
- `POST /api/uploads/[id]/complete` finalizes the same session idempotently.
- `DELETE /api/uploads/[id]` cancels unfinished work.

Binary parts are 8 MiB, with an exact shorter final part. Mutations enforce
same-origin checks and every operation revalidates ownership/account access.
The retained mobile direct-upload contract and scoped integration API continue
using the shared ingestion service.

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

`searchRecordingsAction` accepts `{query, page, pageSize, contactId, startDate,
endDate}` and returns recording results, per-recording passage matches with source
segments/timing/revision, indexing coverage, `hasMore`, and explicit `mode` /
`fallbackReason`. Ranked totals describe the bounded candidate window.

### Contacts And Google Sync

Files:

- `src/app/actions/google-auth.ts`
- `src/app/actions/save-contacts.ts`

Main actions:

- `getGoogleAuthUrl`
- `saveContactsToMongoDB`

Google Contacts refresh and disconnection use `POST /api/contacts/sync` and
`POST /api/contacts/disconnect`; they are route handlers, not exported actions.

### Sharing, Stats, Export, Notifications, Plans

Files:

- `src/app/actions/sharing.ts`
- `src/app/actions/stats.ts`
- `src/app/actions/export.ts`
- `src/app/actions/notifications.ts`
- `src/app/actions/plans.ts`

Main actions:

- `createShareLink`
- `listRecordingShares`
- `revokeShareLink`
- `getStatsAction`
- `startExport`
- `getExportStatus`
- `retryExport`
- `fetchNotifications`
- `readNotification`
- `readAllNotifications`
- `clearAllNotifications`
- `sendTestNotification`
- `getPublishedPlans`
- `getUpgradeablePlans`

`fetchNotifications({ limit?, cursor? })` returns
`{ notifications, unreadCount, nextCursor }`. The default page size is 20, with a
maximum of 100. Pass the returned opaque cursor to load older notifications in
descending creation-time/ID order. The unread count covers the current user's
whole history; reading or clearing all notifications also covers unloaded pages.

`startExport(targetUserId?)` and `getExportStatus(targetUserId?)` default to the
current account. The optional employee target requires company archive access.
`retryExport(jobId, targetUserId?)` resumes the same eligible failed archive;
it preserves the original fresh-export window and permits at most two generation
attempts in total. Status responses include `retryAvailable` and, when retry is
unavailable, `retryUnavailableReason`. Retry rechecks access, the source revision,
archive expiry, and saved parts before queuing work. A failed job is not retried
automatically by cron. See [exports](user-guide.md#exports).

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
- `src/app/actions/team.ts`

Main admin capabilities:

- health checks and incident clearing
- company setup, employee invitations, and company archive queries
- test email through the configured SMTP or Resend backend
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
| `GET` | `/api/system-settings/public` | returns maintenance-mode state and enabled company settings; falls back to maintenance off on a settings read failure |

### Product Data

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/contacts` | returns contacts for the current user |
| `GET` | `/api/contacts/[id]` | returns an owned contact |
| `POST` | `/api/contacts/sync` | runs a foreground Google Contacts refresh for the current user |
| `POST` | `/api/contacts/disconnect` | removes the current user's saved Google Contacts connection |
| `GET` | `/api/filesystem` | returns the storage/file tree for the current user |
| `GET` | `/api/recordings` | lists/searches the current user's recordings |
| `GET` | `/api/recordings/[id]` | returns an owned recording, or company recording when authorized |
| `GET` | `/api/recordings/[id]/play` | returns a signed playback URL after recording access checks |
| `GET` | `/api/stats` | returns the current user's dashboard statistics |
| `POST` | `/api/transcribe` | persists an authorized manual transcription request |
| `PUT` | `/api/uploads/content` | streams the bounded upload fallback with an instance session, upload token, and allowed Origin |
| `POST`, `DELETE` | `/api/notifications/subscribe` | registers or removes a browser push subscription |
| `POST` | `/api/support` | accepts managed-site support requests; billing-disabled instances return `403` with the GitHub support URL |

### Transcription Workspace

These routes require an instance cookie or bearer session. See
[batch behavior](transcription-batches.md) for approval, pause, and retry rules.

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `POST` | `/api/transcription/imports` | creates the user's persisted bulk-import identity |
| `GET` | `/api/transcription/workspace` | lists waiting recordings and batches with pagination cursors |
| `POST` | `/api/transcription/batches` | saves a batch selection |
| `PATCH` | `/api/transcription/batches/[id]` | edits, starts, pauses, retries, or removes an owned batch |

### Integration Credential Management

These routes require an instance session and allowed Origin, rather than an API
token. They are limited to 30 credential operations per owner per minute.

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET`, `POST` | `/api/user/api-tokens` | lists named credentials or creates one, displaying its secret once |
| `DELETE` | `/api/user/api-tokens/[id]` | revokes an owned credential |
| `POST` | `/api/user/api-tokens/[id]/rotate` | rotates an active owned credential; send `{}` as JSON |

### Billing

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `POST` | `/api/stripe/checkout` | creates a Stripe Checkout session |
| `POST` | `/api/stripe/portal` | creates a Stripe customer portal session |
| `GET` | `/api/stripe/invoices` | lists recent invoices for the current user |
| `GET` | `/api/stripe/billing/status` | returns billing, prepaid, processing, and pending-change status |
| `POST` | `/api/stripe/plan-change/preview` | previews an allowed plan change |
| `POST`, `DELETE` | `/api/stripe/plan-change` | requests a plan change or cancels a scheduled change |
| `GET` | `/api/stripe/plan-change/[id]` | reads an owned change operation |
| `GET`, `POST`, `PATCH` | `/api/stripe/usage-topup` | reads prepaid state, creates a top-up, or updates automatic top-up settings |
| `POST` | `/api/stripe/lifetime/resume` | starts recovery of Lifetime usage billing |
| `POST` | `/api/stripe/webhook` | processes Stripe events idempotently |
| `POST` | `/api/stripe/meter-webhook` | validates thin meter-error notifications with a separate signing secret |

Customer billing operations require `NEXT_PUBLIC_ENABLE_BILLING=true` and return
`403` when it is off. The two Stripe webhook endpoints instead acknowledge billing
disabled with `200` and perform no processing.

### Mobile Sync

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `POST` | `/api/mobile/sync-session` | creates a short-lived mobile sync token for the authenticated user |
| `POST` | `/api/mobile/direct-upload/init` | initializes client mobile direct upload |
| `POST` | `/api/mobile/direct-upload/complete` | finalizes client mobile direct upload |

Mobile upload routes accept an instance session or the limited sync token created
by `/api/mobile/sync-session`. The sync token expires after `24 hours`.

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
| `GET` | `/api/cron/process-exports` | claims pending or stale export workers and cleans up expired archives |
| `GET` | `/api/cron/cleanup-recordings` | enforces cleanup and retention rules |
| `GET` | `/api/cron/process-ingestion` | recovers uploads and persisted transcription work |
| `GET` | `/api/cron/process-usage` | reconciles managed billing and retries persisted usage delivery |
| `GET` | `/api/cron/digest` | sends eligible weekly/monthly activity digests |

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

These are accepted recording limits, subject to account capacity. Versioned simple
uploads default to `25 MiB`; direct integration uploads are advertised only when
the deployed bucket permits them. See [integration capabilities](integration-api.md).

## Support Route Behavior

With billing disabled, `POST /api/support` returns `403` with `error` and
`supportUrl`, without validating or storing a submission or sending email.
On the managed site (`NEXT_PUBLIC_ENABLE_BILLING=true`), it:

- validates the JSON body with `zod`
- rejects submissions that fill the honeypot `companyWebsite` field
- rejects cross-origin submissions that do not match the public app origin
- rate limits by client IP
- stores every accepted request in `support_messages`
- resolves the recipient from `siteProfile.supportEmail`, falling back to `SUPPORT_EMAIL`
- stores `pending` delivery state only when that recipient exists and `EMAIL_PROVIDER` is not `none`, otherwise `skipped`
- sends eligible support email after the response with Next.js `after(...)`

## Stripe Webhook Events

`POST /api/stripe/webhook` handles:

- checkout completion and async checkout outcomes
- checkout expiration notifications
- subscription create, update, pause, resume, delete, and pending-update lifecycle events
- invoice payment success and failure events
- invoice finalization, voiding/uncollectible state, prepaid payment success, and credit-grant updates
- charge refunds, disputes, refund updates, and credit-note review events
- product/price/meter changes that invalidate catalog discovery
- `customer.deleted`

The webhook processor records state in `stripe_webhook_events`.

## Deployment authentication and retained APIs

Better Auth serves `/api/auth/*` for every deployment. Browser API requests send cookies through `authFetch`; other clients may send `Authorization: Bearer <session-token>`. The shared product APIs resolve either the instance's cookie or bearer session and reject disabled/deleted profiles.

`POST /api/mobile/sync-session` accepts instance-native cookie/bearer auth. The upload init/complete endpoints accept that identity or a limited sync token; upload completion tokens cannot be used for sync authentication.

`POST /api/transcribe` accepts `recordingId`, optional `provider`/`model`, and
`acknowledgeProviderOutcome` for an eligible reviewed retry; configured providers
are `soniox`, `elevenlabs`, `gemini` and `openai_compat`. Successful scheduling returns 202.

`GET /api/recordings` accepts `page`, `limit`, and `search` for owner-scoped search
with Atlas/regex fallback and inclusive full-day date filters.
`GET /api/recordings/[id]/play` returns a public-host signed playback URL, valid for
five minutes in company mode or one hour otherwise. API v1 download links have
their separate five-minute lifetime.

`GET /api/health` checks process/database readiness. `GET /api/cron/process-usage` retries persisted managed meter events; see [scheduled jobs](cron-jobs.md).
