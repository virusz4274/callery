# API Reference

Call Memo uses Server Actions for most authenticated product behavior and route handlers for auth, webhooks, billing, support, filesystem, and scheduled jobs.

## Server Actions

Location: `src/app/actions`

## Product Actions

### Recordings

File: `src/app/actions/recordings.ts`

- `getRecordingsAction`
- `getRecordingDetailsAction`
- `getPlaybackUrlAction`
- `updateRecordingAction`
- `deleteRecordingAction`

### Upload

Files:

- `src/app/actions/upload/direct-upload.ts`
- `src/app/actions/upload/upload-single-file.ts`
- `src/app/actions/upload/transcription.ts`
- `src/app/actions/upload/prepare-upload-context.ts`
- `src/app/actions/upload/validation.ts`

Main public flow:

- `initializeDirectUpload`
- `completeDirectUpload`
- `uploadSingleFile`
- `triggerAutoTranscription`

Legacy note:

- `src/app/actions/upload-recordings.ts` still exists but is not the primary browser flow.

### Transcription And Search

Files:

- `src/app/actions/transcription.ts`
- `src/app/actions/search-actions.ts`
- `src/app/actions/transcription-providers.ts`
- `src/app/actions/user-settings.ts`

Main actions:

- `transcribeRecordingAction`
- `searchRecordingsAction`
- `getAvailableProviders`
- `getProviderMultiplier`
- `updateTranscriptionSettings`

### Contacts And Google Sync

Files:

- `src/app/actions/contacts.ts`
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

## Admin Actions

Files:

- `src/app/actions/admin-health.ts`
- `src/app/actions/admin-plans.ts`
- `src/app/actions/admin-settings.ts`
- `src/app/actions/admin-announcements.ts`
- `src/app/actions/audit-log.ts`
- `src/app/actions/admin/users.ts`
- `src/app/actions/admin/recordings.ts`
- `src/app/actions/admin/stats.ts`
- `src/app/actions/delete-recordings.ts`
- `src/app/actions/update-contact-plan.ts`
- `src/app/actions/admin.ts`

Main admin operations include:

- system health checks
- plan CRUD
- system settings reads and updates
- announcement CRUD
- audit log retrieval
- user search and mutations
- orphaned recording cleanup
- bulk deletion

## Route Handlers

Location: `src/app/api`

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Creates a server session from the authenticated Firebase user |
| `GET`, `POST` | `/api/auth/logout` | Clears the current session |
| `GET` | `/api/auth/google/callback` | OAuth callback for Google Contacts sync |
| `GET`, `PATCH` | `/api/user/profile` | Read and update the current profile |
| `POST` | `/api/user/ensure-profile` | Ensure a MongoDB user exists for the signed-in Firebase user |
| `PATCH` | `/api/user/billing-settings` | Toggle overage preferences |
| `GET` | `/api/contacts` | Read contacts for the current user |
| `GET` | `/api/filesystem` | Return the storage/file tree for the current user |
| `GET` | `/api/recordings/[id]` | Read a single recording payload |
| `POST` | `/api/stripe/checkout` | Create a Stripe Checkout session |
| `POST` | `/api/stripe/portal` | Create a Stripe Customer Portal session |
| `GET` | `/api/stripe/invoices` | Read recent invoices for the current user |
| `POST` | `/api/stripe/webhook` | Handle Stripe events |
| `POST` | `/api/webhooks/soniox` | Handle Soniox transcription callbacks |
| `POST` | `/api/webhooks/elevenlabs` | Handle ElevenLabs transcription callbacks |
| `POST`, `DELETE` | `/api/notifications/subscribe` | Register or remove a browser push subscription |
| `GET` | `/api/system-settings/public` | Return public-facing system settings needed by the client |
| `POST` | `/api/support` | Create a support request |
| `GET` | `/api/cron/process-exports` | Process pending export jobs |
| `GET` | `/api/cron/cleanup-recordings` | Enforce cleanup and retention rules |

## Public Pages With Signed Access

- `/s/[token]`: public read-only shared recording page

This route is page-based rather than an API handler.

## Upload Flow

The production upload path is:

1. `initializeDirectUpload`
2. direct client `PUT` to R2
3. `completeDirectUpload`
4. optional `triggerAutoTranscription`

Constraints:

- Maximum upload size: `5 GiB`
- Maximum transcription size: `2 GiB`

## Webhook Security

### Soniox

- Endpoint: `POST /api/webhooks/soniox`
- Requires `X-Soniox-Secret`
- Expects callback metadata containing recording and user context

### ElevenLabs

- Endpoint: `POST /api/webhooks/elevenlabs`
- Requires valid `ElevenLabs-Signature`
- Expects callback metadata for recording correlation

### Shared webhook behavior

Both transcription webhooks:

- validate the callback against the stored external transcription ID
- process idempotently through `transcription_webhook_events`
- only finalize usage/accounting after successful claim and processing

## Stripe Webhook Events

`POST /api/stripe/webhook` currently handles:

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

Stripe event processing is idempotent through the `stripe_webhook_events` collection.

## Cron Authentication

Both cron routes require:

```http
Authorization: Bearer <CRON_SECRET>
```

## Index And Seed Initialization

After initial setup and after backend index changes:

```bash
npx tsx src/lib/db/init.ts
```
