# Data Model

This document describes the MongoDB collections currently used by Call Memo.

Collection names are defined in `src/lib/mongodb.ts`.

## Core Collections

### `users`

Stores application users linked to Firebase Auth.

Important fields:

- `firebaseUid`
- `email`, `firstName`, `lastName`, `name`, `phoneNumber`
- `role`
- `plan`
- `disabled`
- `timezone`
- `notificationSettings`
- `transcriptionSettings`
- `storageSettings`
- `billingSettings`
- `storageUsed`, `storageAllocation`, `storagePeakUsed`, `storagePeakPeriodEnd`
- `transcriptionUsed`, `transcriptionAllocation`
- `totalContacts`, `totalRecordings`, `totalDuration`
- Stripe fields such as `stripeCustomerId`, `stripeSubscriptionId`, `stripeSubscriptionStatus`
- `trialEndsAt`, `lastLoginAt`
- `pushSubscriptions`
- `softDelete`

Notable nested structures:

```ts
notificationSettings: {
  activityDigest: 'off' | 'weekly' | 'monthly';
  ingestSuccess: boolean;
  ingestFail: boolean;
}

transcriptionSettings: {
  autoTranscribe: boolean;
  defaultProvider?: 'soniox' | 'elevenlabs';
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

Stores uploaded audio metadata, transcript state, search payloads, and library-level tags.

Important fields:

- `firebaseUid`
- `contactId`, `contactName`, `phoneNumber`
- `r2Key`, `fileName`, `fileSize`, `mimeType`, `duration`
- `recordedAt`, `createdAt`, `updatedAt`
- `transcriptionStatus`
- `fullTranscript`
- `languageCode`
- `transcriptionProvider`, `transcriptionModel`, `transcriptionCostMultiplier`
- `externalTranscriptionId`
- `transliteratedTranscript`, `translatedTranscript`, `additionalTranscriptions`
- `summary`, `summaryEmbedding`, `transcriptEmbedding`
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

Stores contact records from Google sync and app-side normalization.

Important fields:

- `firebaseUid`
- `googleContactId`
- `name`, `firstName`, `lastName`
- `phoneNumbers`
- `email`
- `jobTitle`, `company`
- `totalRecordings`
- `lastRecordingAt`

### `plans`

Stores plan definitions shown in pricing and used by billing logic.

Important fields:

- `name`, `description`
- `price`, `currency`, `interval`
- `limits.storage`, `limits.transcription`
- `features`
- `stripePriceId`
- `stripeStoragePriceId`
- `stripeTranscriptionPriceId`
- `isDefault`, `isActive`

### `system_settings`

Singleton-like collection for platform-wide configuration.

Important fields:

- `allowSignups`
- `maintenanceMode`
- `defaultPlanId`
- `transcriptionMultipliers`
- `updatedAt`

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

In-app notification center entries.

Fields include:

- `userId`
- `type`
- `title`
- `message`
- `isRead`
- `link`
- `createdAt`

### `admin_logs`

Audit log entries for admin actions.

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

Tracks long-running user export jobs.

Fields include:

- `firebaseUid`
- `status`
- `progress`
- `totalRecordings`
- `processedRecordings`
- `parts`
- `checkpoint`
- `error`
- `createdAt`, `updatedAt`, `startedAt`, `completedAt`

Export parts currently store signed download URLs, expiration timestamps, sizes, and R2 keys.

### `support_messages`

Stores submissions from `/api/support`.

Fields include:

- `firebaseUid`
- `name`
- `email`
- `subject`
- `message`
- `userAgent`
- `ipAddress`
- `createdAt`

## Idempotency And Integration Collections

### `stripe_webhook_events`

Tracks Stripe webhook processing state.

Fields include:

- `_id` as Stripe `event.id`
- `type`
- `status`
- `attempts`
- `createdAt`
- `receivedAt`
- `updatedAt`
- `processedAt`
- `lastError`

### `transcription_webhook_events`

Tracks Soniox and ElevenLabs callback processing state to prevent duplicate transcript handling and duplicate billing/usage side effects.

The exact payload shape is operational rather than user-facing, but the collection exists specifically for webhook idempotency and retry safety.

## Collection Summary

```text
users
recordings
contacts
plans
system_settings
announcements
notifications
admin_logs
export_jobs
support_messages
stripe_webhook_events
transcription_webhook_events
```
