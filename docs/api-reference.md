# API Reference

The app uses Server Actions for most authenticated operations and API routes for webhooks, auth callbacks, and integration endpoints.

## Server Actions

Location: `src/app/actions`

### User-facing actions

- `recordings.ts`
  - `getRecordingsAction`
  - `deleteRecordingAction`
  - `updateRecordingAction`
  - `getPlaybackUrlAction`
- `upload/direct-upload.ts`
  - `initializeDirectUpload`
  - `completeDirectUpload`
- `transcription.ts`
  - `transcribeRecordingAction`
- `search-actions.ts`
  - `searchRecordingsAction`
- `stats.ts`
  - `getStatsAction`
- `sharing.ts`
  - `createShareLink`
- `export.ts`
  - `startExport`
  - `getExportStatus`
- `notifications.ts`
  - `fetchNotifications`
  - `readNotification`
  - `readAllNotifications`
  - `clearAllNotifications`
  - `sendTestNotification`
- `google-auth.ts`
  - `getGoogleAuthUrl`
- `contacts.ts`
  - `syncGoogleContacts`
- `save-contacts.ts`
  - `saveContactsToMongoDB`
- `plans.ts`
  - `getPublishedPlans`
- `transcription-providers.ts`
  - `getAvailableProviders`
  - `getProviderMultiplier`
- `user-settings.ts`
  - `updateTranscriptionSettings`
- `admin/users.ts`
  - `restoreUser`

### Upload and transcription constraints

- Direct upload path: client uploads bytes directly to R2 using presigned PUT URLs from `initializeDirectUpload`.
- Upload finalize path: `completeDirectUpload` verifies object existence/size before DB write and transcription scheduling.
- Upload size limit: 5 GiB per recording.
- Transcription processing limit: 2 GiB per recording.
- Legacy action `upload-recordings.ts` remains in code but is not the primary client flow.

### Admin actions

- `admin-health.ts`: `checkSystemHealth`
- `admin-plans.ts`: `getPlans`, `getPlanById`, `createPlan`, `updatePlan`, `deletePlan`
- `admin-settings.ts`: `getSystemSettings`, `updateSystemSettings`
- `admin-announcements.ts`: CRUD + active announcements
- `audit-log.ts`: `logAdminAction`, `getAuditLogs`
- `update-contact-plan.ts`: `updateContactPlan`
- `delete-recordings.ts`: `deleteRecordings`

## API Routes

Location: `src/app/api`

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Create login session/cookies |
| `POST`, `GET` | `/api/auth/logout` | End session |
| `GET` | `/api/auth/google/callback` | OAuth callback for Google contacts |
| `GET` | `/api/user/profile` | Read current user profile |
| `PATCH` | `/api/user/profile` | Update current user profile |
| `POST` | `/api/user/ensure-profile` | Ensure initial user record exists |
| `PATCH` | `/api/user/billing-settings` | Update overage toggle |
| `GET` | `/api/contacts` | Contacts API endpoint |
| `GET` | `/api/filesystem` | File browser tree data |
| `GET` | `/api/recordings/[id]` | Recording details endpoint |
| `POST` | `/api/stripe/checkout` | Create Stripe checkout session |
| `POST` | `/api/stripe/portal` | Create Stripe customer portal URL |
| `GET` | `/api/stripe/invoices` | Fetch current user Stripe invoice history |
| `POST` | `/api/stripe/webhook` | Stripe event handler |
| `POST` | `/api/webhooks/soniox` | Soniox transcription webhook |
| `POST` | `/api/webhooks/elevenlabs` | ElevenLabs transcription webhook |
| `POST` | `/api/notifications/subscribe` | Register push subscription |
| `DELETE` | `/api/notifications/subscribe` | Remove push subscription |
| `POST` | `/api/support` | Support request endpoint |
| `GET` | `/api/cron/process-exports` | Process queued export jobs |
| `GET` | `/api/cron/cleanup-recordings` | Run retention cleanup |

## Transcription Webhook Security

- Soniox (`POST /api/webhooks/soniox`)
  - Requires `X-Soniox-Secret` header matching `SONIOX_WEBHOOK_SECRET`.
  - Requires callback metadata (`recordingId`, `firebaseUid`) and payload `id/status`.
- ElevenLabs (`POST /api/webhooks/elevenlabs`)
  - Requires `ElevenLabs-Signature` verification using `ELEVENLABS_WEBHOOK_SECRET`.
  - Requires webhook metadata with `recordingId` + `firebaseUid`.

Both webhook handlers:

- Validate callback correlation against `recordings.externalTranscriptionId`.
- Use idempotent event claiming/marking in `transcription_webhook_events`.
- Only report usage/billing after a successful idempotent claim.

## Stripe Webhook Events Handled

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

Webhook processing is idempotent by Stripe `event.id`.

## Index Initialization

After first setup and after pulling backend/index changes, run:

```bash
npx tsx src/lib/db/init.ts
```

This applies indexes required for webhook idempotency collections (`stripe_webhook_events`, `transcription_webhook_events`) and core query paths.

## Cron Auth

Cron routes require:

```http
Authorization: Bearer <CRON_SECRET>
```
