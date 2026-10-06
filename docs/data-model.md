# Data Model

This document describes the MongoDB collections currently used by Callery.

Collection names are defined in `src/lib/mongodb.ts`.

## Core Collections

Better Auth owns separate `user`, `account`, `session` and `verification` collections.
The Mongo adapter stores `user._id` and linked `account.userId`/`session.userId`
as ObjectIds. Permanent deletion uses those reference types and removes reset
verification records after retryable storage/billing cleanup succeeds.

### `users`

Stores application profiles linked to Better Auth. `authSubject` is the stable string form of the Better Auth user ObjectId.

Important fields:

- `authSubject`
- `email`, `firstName`, `lastName`, `name`, `phoneNumber`, `photoURL`
- `role`
- `planKey`
- `disabled`
- `timezone`
- `notificationSettings`
- `transcriptionSettings`
- `storageSettings`
- `billingSettings`
- `storageUsed`, `storageAllocation`, `storagePeakUsed`, `storagePeakPeriodEnd`
- `transcriptionUsed`, `transcriptionAllocation`
- `totalContacts`, `totalRecordings`, `totalDuration`
- `stripeCustomerId`, `stripeSubscriptionId`, `stripePriceId`, `stripeSubscriptionStatus`, `stripeCurrentPeriodEnd`
- `trialEndsAt`, `lastLoginAt`
- `pushSubscriptions`
- `googleSync`
- `softDelete`

Signup creates all settings objects, usage counters (including
`storagePeakUsed`), and `googleSync`. Profile edits update supplied nested fields
atomically and preserve their siblings. Google credentials and subscription
details remain optional until the corresponding service is connected.

`googleSync` starts with `status: 'not_connected'` and stores encrypted refresh-token material:

```ts
googleSync: {
  status: 'not_connected' | 'syncing' | 'completed' | 'failed';
  connectedAt?: Date;
  lastAttemptAt?: Date;
  lastSyncedAt?: Date;
  refreshTokenCiphertext?: string;
  refreshTokenKeyVersion?: string;
  lastError?: string | null;
}
```

Key nested structures:

```ts
notificationSettings: {
  activityDigest: 'off' | 'weekly' | 'monthly';
  ingestSuccess: boolean;
  ingestFail: boolean;
}

transcriptionSettings: {
  autoTranscribe: boolean;
  defaultProvider?: 'soniox' | 'elevenlabs' | 'gemini' | 'openai_compat';
  defaultModel?: string;
}

storageSettings: {
  deletionPolicy: 'never' | '3m' | '6m' | '1y';
}

billingSettings: {
  allowOverage: boolean;
}
```

### `recordings`

Stores uploaded audio metadata, transcript state, embeddings, and user-facing archive state.

Important fields:

- `authSubject`
- `contactId`, `contactName`, `phoneNumber`, `normalizedPhoneNumber`
- `r2Key`, `fileName`, `standardizedDisplayName`, `fileSize`, `mimeType`, `duration`
- `recordedAt`, `createdAt`, `updatedAt`
- `transcriptionStatus`
- `fullTranscript`
- `languageCode`
- `transcriptionProvider`, `transcriptionModel`, `transcriptionCostMultiplier`
- `externalTranscriptionId`
- `transcriptionUsageReportId`, `transcriptionUsageReportedAt`
- `summary`, `summaryEmbedding`
- `tags`
- `isStarred`, `isArchived`

Transcript segments are stored as:

```ts
fullTranscript: {
  speakerId: string;
  text: string;
  start?: number;
  end?: number;
  words: {
    text: string;
    start?: number;
    end?: number;
    speakerId?: string;
    confidence?: number;
  }[];
  transliteratedText?: string;
}[]
```

### `contacts`

Stores normalized contact records and Google Contacts sync results.

Important fields:

- `authSubject`
- `googleContactId`
- `name`, `firstName`, `lastName`
- `phoneNumbers`, `normalizedPhoneNumbers`
- `email`
- `jobTitle`, `company`
- `createdAt`, `updatedAt`
- `totalRecordings`
- `lastRecordingAt`

### `plans`

Stores plan definitions used by pricing and billing logic.

Important fields:

- `key`
- `name`, `description`
- `price`, `currency`, `interval`
- `limits.storage`, `limits.transcription`
- `features`
- `stripePriceId`
- `stripeStoragePriceId`
- `stripeTranscriptionPriceId`
- `isDefault`, `isActive`

### `system_settings`

Singleton-like collection for shared platform settings.

Important fields:

- `allowSignups`
- `maintenanceMode`
- `defaultPlanId`
- `transcriptionMultipliers.soniox`
- `transcriptionMultipliers.elevenlabs`
- `transcriptionMultipliers.gemini`
- `transcriptionMultipliers.openai_compat`
- `updatedAt`

`pnpm db:init` creates complete settings with a required `defaultPlanId` after
seeding plans. Repeat initialization preserves existing settings. Admin edits
require this singleton to exist.

## Operational Collections

### `announcements`

System-wide notices shown to users.

Fields include:

- `title`
- `message`
- `type`
- `isActive`
- `startDate`
- `endDate`
- `createdBy`
- `createdAt`

### `notifications`

In-app notification entries.

Fields include:

- `userId`
- `type`
- `title`
- `message`
- `isRead`
- `link`
- `createdAt`

### `admin_logs`

Admin audit entries.

Fields include:

- `adminId`
- `adminEmail`
- `action`
- `targetId`
- `targetType`
- `details`
- `ipAddress`
- `createdAt`

### `export_jobs`

Tracks long-running export jobs.

Fields include:

- `authSubject`
- `status`
- `progress`
- `totalRecordings`
- `processedRecordings`
- `parts`
- `checkpoint`
- `error`
- `createdAt`, `updatedAt`, `startedAt`, `completedAt`

Each part stores a signed download URL, key, size, and expiration time.
Every new job includes `parts: []` and `checkpoint: { nextPartNumber: 1 }`.
Processing persists the cursor and next part number for recovery after interruption.

### `external_service_incidents`

Stores deduplicated integration incidents for admin health visibility.

Important fields:

- `provider`, `service`, `operation`
- `errorKind`
- `severity`
- `status`
- `retryable`
- `httpStatus`
- `dedupeKey`
- `message`
- `firstSeenAt`, `lastSeenAt`
- `occurrenceCount`
- `cooldownUntil`
- `resolvedAt`, `staleAt`

### `support_messages`

Stores submissions from `/api/support`.

Important fields:

- `authSubject` (`null` for anonymous submissions)
- `name`, `email`, `subject`, `message`
- `userAgent`, `ipAddress`
- `deliveryStatus`: `pending`, `sending`, `sent`, `failed`, `skipped`
- `deliveryAttempts`
- `lastDeliveryError`
- `emailedAt`
- `createdAt`

### `rate_limit_buckets`

Stores short-lived rate limit counters.

Important fields:

- `_id`
- `count`
- `expiresAt`
- `createdAt`
- `updatedAt`

## Integration And Idempotency Collections

### `stripe_webhook_events`

Tracks Stripe webhook processing state.

Fields include:

- `_id` as the Stripe event ID
- `type`
- `status`
- `attempts`
- `receivedAt`
- `processedAt`
- `lastError`
- `createdAt`, `updatedAt`

### `transcription_webhook_events`

Tracks Soniox and ElevenLabs callback processing state.

It exists specifically to prevent duplicate transcript application and duplicate usage side effects across webhook retries.

Fields include:

- `_id` as `<provider>:<recordingId>:<externalTranscriptionId>:<deliveryStatus>`
- `provider`
- `recordingId`
- `externalTranscriptionId`
- `deliveryStatus`
- `status`
- `attempts`
- `receivedAt`
- `processedAt`
- `lastError`
- `updatedAt`

## Index And TTL Highlights

The current init code creates:

- unique indexes on `users.authSubject`, `recordings.r2Key`, and `plans.name`
- contact uniqueness by `authSubject + phoneNumbers`
- sort/filter indexes for recordings, contacts, notifications, logs, export jobs, and incidents
- TTL on webhook event history after 90 days
- TTL on `rate_limit_buckets.expiresAt`

## Collection Summary

```text
users
recordings
contacts
plans
export_jobs
system_settings
announcements
admin_logs
notifications
external_service_incidents
support_messages
rate_limit_buckets
stripe_webhook_events
transcription_webhook_events
```

## Usage delivery ledger

`usage_events` stores customer/account, storage-period or transcription-run identifiers, integer values, reported values, timestamps, pending state and retry/lease metadata. Delivery snapshots preserve identical retries while newer storage peaks wait. The `pending_usage` index supports cron claims. Billing-off instances do not enqueue events.

`storageUsed` is current capacity; `storagePeakUsed` and `storagePeakPeriodEnd` track the maximum within the billing period. Deleting recordings reduces capacity without refunding that peak. Period renewal resets the baseline and transcription allowance.

Local Better Auth uses separate adapter collections (`user`, `session`, `account`); these are distinct from application `users` profiles.
