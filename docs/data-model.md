# Data Model

This document describes the MongoDB collections currently used by Callery.

Core collection names are defined in `src/lib/mongodb.ts`. Integration collection
names and indexes live in `src/lib/integrations/database.ts`; processing and
financial modules also define their own operational collections. This guide
summarizes maintained data shapes rather than listing every internal journal.

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
- `teamInvitationPending`, `accessRevokedAt`
- `timezone`
- `notificationSettings`
- `transcriptionSettings`
- `storageSettings`
- `billingSettings`
- `storageUsed`, `storageAllocation`, `storagePeakUsed`, `storagePeakPeriodEnd`
- `transcriptionUsed`, `transcriptionAllocation`
- `totalContacts`, `totalRecordings`, `totalDuration`
- `stripeCustomerId`, `stripeSubscriptionId`, `stripePriceId`, `stripeSubscriptionStatus`, `stripeCurrentPeriodEnd`
- `stripeCustomerGeneration`, `stripeBillingLease`, `stripeMetering`
- `billingEntitlement`, `lifetimePurchase`, `billingUsageTariffs`, `billingCatalogVersion`
- `billingAccount`, `billingOperation`, `billingReview`, `billingRecovery`
- `trialEndsAt`, `lastLoginAt`
- `pushSubscriptions`
- `googleSync`
- `softDelete`
- `uploadReservations`, `uploadReceipts` (atomic capacity holds and completed-upload accounting)

Signup validates the configured active onboarding plan before creating a
profile. Managed defaults must be Free Trial; self-hosted defaults may reference
any existing active plan. Signup creates all settings objects, usage counters (including
`storagePeakUsed`), and `googleSync`. Profile edits update supplied nested fields
atomically and preserve their siblings. Google credentials and subscription
details remain optional until the corresponding service is connected.
Free Trial has a nonrenewing `trial` plan interval and one `trialEndsAt` deadline
30 days after its original grant. Existing-profile login does not reset that
deadline or consumption. `UserResponse.transcriptionUnlimited` is derived for
the Internal plan in self-hosted mode and requires a verified Internal
entitlement in managed mode. It does not overwrite usage counters or authorize
customer Stripe billing.

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
- `ingestionId`, `integration.source`, `integration.externalId`, `integration.metadata`, `integration.fingerprint`
- `bulkImportId`, `transcriptionBatchId`, `recordingDateKey`
- `recordedAt`, `createdAt`, `updatedAt`
- `transcriptionStatus`
- `processingStatus`, `transcriptionJobId`, `transcriptionAttemptId`
- `transcriptionEnrichmentPending`, `transcriptionEnrichmentSteps`, `transcriptionCompletionPending`
- `aiWorkPlan`, `aiWorkCheckpoints`, `aiWorkRevision` (server-only recovery state)
- `fullTranscript`
- `languageCode`
- `transcriptionProvider`, `transcriptionModel`, `transcriptionCostMultiplier`
- `externalTranscriptionId`
- `transcriptionUsageReportId`, `transcriptionUsageReportedAt`
- `summary`, `summaryEmbedding`
- `tags`
- `isStarred`, `isArchived`

`processingStatus` identifies the current phase, known or uncertain outcome, and
permitted retry action alongside the existing transcription status.
`recordingDateKey` retains the validated call calendar date from a recognized
filename for batch grouping; it can be null or absent on older recordings.
The scoped API v1 response exposes integration source, external ID and custom
metadata, while omitting storage keys and private execution checkpoints.

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

Stores installation templates and editable draft plan definitions. Managed
public offers and financial terms come from published catalog snapshots, not
from a mutable plan document or a nonempty Stripe ID alone.

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

Singleton collection for shared platform settings. A fresh initialization uses
one fixed ObjectId so concurrent initializers cannot create multiple settings
documents. An existing singleton retains its ID and values. Initialization
reports duplicates as an error without choosing or deleting a document.

Important fields:

- `allowSignups`
- `maintenanceMode`
- `processingPaused` (optional instance pause on new provider calls)
- `team` (self-hosted company settings)
- `defaultPlanId`
- `transcriptionMultipliers.soniox`
- `transcriptionMultipliers.elevenlabs`
- `transcriptionMultipliers.gemini`
- `transcriptionMultipliers.openai_compat`
- `updatedAt`

`pnpm db:init` inserts missing settings with a required `defaultPlanId` after
seeding plans. Fresh settings omit optional `transcriptionMultipliers`, allowing
self-host environment defaults to apply until explicitly overridden. Managed
processing always uses the approved 1×/3×/5× provider policy; these self-host
overrides cannot alter managed billing. Repeat initialization preserves existing
settings. Admin edits require exactly one settings document to exist.

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

An optional `eventKey` deduplicates processing notifications per user through a
partial unique index; ordinary unkeyed notifications remain valid.

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
- `requestedByAuthSubject` (the actor, which can be a company administrator)
- `sourceRevision`, `cacheEligible`
- `status`
- `progress`
- `totalRecordings`
- `processedRecordings`
- `parts`
- `checkpoint`
- `error`
- `failure` (safe stage/code, retry eligibility, optional transport/HTTP code, timestamp, generation and part)
- `generationAttempts`, `workerToken`, `workerLeaseUntil`
- `archiveExpiresAt`, `cleanupPending`, `abortedAt`, `cleanedAt`
- `createdAt`, `updatedAt`, `startedAt`, `completedAt`

Each part stores a signed download URL, key, size, and expiration time.
Every new job includes `parts: []` and `checkpoint: { nextPartNumber: 1 }`.
Processing persists the cursor and next part number for recovery after interruption.
An atomic claim increments `generationAttempts` and gives one worker a renewable
lease; only that worker may publish checkpoints or terminal outcomes. Eligible
failed jobs require an explicit retry and may use at most two generation attempts.
The original source revision and fresh-export window remain unchanged on retry.

### `export_object_cleanup`

Tracks each archive object before upload so interrupted writes and account erasure
can be cleaned up safely. `_id` is the storage key; fields include `subject`,
`jobId`, `owner`, `state` (`writing`, `ready`, `pending`, or `deleting`), write and
cleanup leases, and `expiresAt`. Worker-specific object keys prevent stale writes
from overwriting a replacement worker's part. Checkpoint recovery verifies a ready
object record and matching storage size. Cron claims deletion before removing
bytes and removes records only after cleanup succeeds.

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

### `integration_tokens`

Named API credentials contain `owner`, stable `integrationId`, display `name`,
hashed secret and visible `prefix`, allowed `scopes`, credential issue/expiration
dates, and optional revocation/last-use timestamps. Rotation replaces the hash
without changing the integration identity. Only the creation/rotation response
contains the raw secret; it is not persisted.

### `integration_uploads`

Durable upload sessions contain the owner/integration identity, hashed
`requestKey`, metadata fingerprint, validated input/prepared metadata, staging and
final object keys, storage upload ID, reservation/lease state, expiry, and eventual
recording ID. Browser and mobile uploads use `integrationId: 'legacy'` in the same
collection. States are `initializing`, `uploading`, `finalizing`, `completed`,
`cancelled`, and `expired`. Cleanup is explicit rather than TTL deletion, so object
references and capacity holds survive until recovery finishes. Completed sessions
retain idempotency keys for at least seven days; cleaned terminal sessions can be
removed after 30 days, and completed upload-accounting receipts compact after one day.

### `integration_jobs` and `transcription_dispatch`

Manual, automatic and approved batch transcription share `integration_jobs`.
Each job stores its owner, recording ID, options, state, attempt identity, lease,
safe processing status, optional batch ID, and bounded attempt history. States are
`pending`, `running`, `submitted`, `completed`, `failed`, and `needs_review`.
`transcription_dispatch` holds the instance-wide `transcription` slot, identifying
the one admitted job/attempt, including work waiting for a provider callback.

### `transcription_imports` and `transcription_batches`

Imports retain their owner and creation time. A batch retains its owner, selected
recording IDs, name/date grouping, provider/model, total duration, status, and
standalone MongoDB reservation-recovery markers. Batch states are `draft`,
`running`, `paused`, `completed`, and `needs_review`. Creating an import or draft
does not itself authorize provider calls; see [transcription batches](transcription-batches.md).

### Other operational records

`team_invitations` stores company admission state with unique invitation email.
`search_embedding_cache` stores expiring search-query embeddings with an expiry
TTL. `processing_execution_policies` and `processing_provider_calls` retain accepted
execution limits and provider-call observations; `ai_cost_receipts` retains AI
receipt evidence. These are distinct from the recording's user-visible transcript.

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

Only successfully processed events expire, 90 days after `processedAt`, through
a partial TTL index filtered to `status: 'processed'`. Failed and processing
events remain available for recovery. Initialization replaces only the known
legacy receipt-time TTL; an unrecognized conflicting index requires explicit
operator correction.

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
- unique `plans.key` and financial idempotency/payment/grant constraints
- contact uniqueness by `authSubject + googleContactId`
- unique API token hashes, upload request keys by owner/integration, recording ingestion IDs, and recording source/external IDs by owner
- unique team invitation emails; processing and batch work/owner indexes
- sort/filter indexes for recordings, contacts, notifications, logs, export jobs, and incidents
- payment state/update-time, usage-processing/account-drain, historical base-price/publication, and nonunique Stripe-customer lookup indexes
- partial TTL on successfully processed Stripe events 90 days after completion; transcription callback history retains its separate receipt-time TTL
- TTL on `rate_limit_buckets.expiresAt`

Financial records have no blanket TTL. Unresolved money, usage, debt, grants and
settlement journals remain retained. Explicit settlement cleanup may remove
resolved financial records only after their 90-day retention deadline.
The safety inspection includes user profiles and every existing `billing_*`
collection, including collections without secondary index definitions. Unsafe
TTL or other index conflicts stop initialization without changing data or
indexes. Explicit `db:init` recreates missing required indexes despite a warm
runtime initialization cache, then refreshes that cache after successful setup.

`pnpm db:init --dry-run` inspects seeds, indexes, preserved differences,
onboarding references and local catalog configuration without writes or Stripe
calls. Missing bootstrap data is planned creation; missing managed prerequisites
are warnings. Structural conflicts fail in both inspection and normal modes.

## Core And Integration Collection Summary

Financial collections and selected additional operational records are described
separately above and below.

```text
users
recordings
contacts
team_invitations
plans
export_jobs
export_object_cleanup
system_settings
announcements
admin_logs
notifications
external_service_incidents
support_messages
rate_limit_buckets
stripe_webhook_events
transcription_webhook_events
integration_tokens
integration_uploads
integration_jobs
transcription_dispatch
transcription_imports
transcription_batches
search_embedding_cache
```

## Managed financial records

Installation seeds create no paid ownership, prepaid funds, Stripe grants,
published tariffs or acceptance evidence. These records arise only from the
corresponding reviewed publication or authoritative payment/accounting flow.

| Collection / field | Purpose |
| --- | --- |
| `billing_catalog_bundles`, `billing_catalog_versions` | Imported draft bundles and immutable published plan/tariff snapshots, including historical base-price mappings |
| `billing_catalog_state` | Atomic active-version pointer and publication outbox; a fresh seed does not activate a catalog |
| `billing_catalog_acceptance` | Reviewed catalog-scoped payment, metering, accounting, storage/recovery and processing-limit acceptance |
| `billing_cost_schedules` | Historical expense-policy evidence; not required for new work or publication |
| `users.billingPaidBasePeriod` | Cached authoritative paid-base service interval, fenced to customer generation, subscription and base Price; separate from prepaid funds or provider expenses |
| `users.billingAccount` | Revision-fenced prepaid funding lots and retail-only reservations, original monthly periods, exact fractional amounts, receipts and durable outbox; atomically updated on standalone MongoDB |
| `billing_usage_receipts`, `billing_financial_archive` | Canonical immutable usage receipts and archived settled accounting history |
| `usage_events` | Frozen chargeable quantities, tariffs, original periods, delivery/processing/invoice proof and owned retry leases |
| `billing_operations`, `billing_prepaid_topups` | Recoverable immediate paid upgrades/Lifetime conversion, renewal downgrades, hosted invoices and prepaid payment evidence |
| `billing_subscription_schedules`, `users.billingSchedule`, `billing_usage_price_rollouts` | Owned Stripe schedule coordination and authoritative adoption of noticed usage-price replacements and renewal downgrades |
| `billing_grant_transfers`, `billing_grant_scope_operations` | Legacy exact-price grant and interrupted-transfer recovery only; new grants cover metered usage broadly |
| `billing_provider_attempts`, `processing_execution_policies` | Immutable accepted execution limits, canonical audio receipts and operational provider usage/attempt observations |
| `billing_provider_cost_evidence`, `billing_provider_cost_scans`, `billing_provider_circuits` | Historical expense reconciliation; no new provider-dollar admission gates |
| `billing_operator_cost_receipts` | Historical operator expense journals; no new trial, grant or Internal dollar caps |
| `billing_credit_note_reviews` | Owned credit-note evidence requiring explicit principal-impact reconciliation |
| `billing_deleted_accounts`, `billing_settlements` | Minimal financial tombstones and independent settlement after personal-content erasure |

Audio uses integer weighted 15-second blocks with SUM aggregation. Storage uses
integer milliGiB of the monthly chargeable peak with LAST aggregation. Generic
immutable tariff snapshots pin the catalog, price/meter, unit, aggregation,
exact decimal rate and minimum policy. Rates and exact amounts use decimal
strings at 10^-12 cents; cash accounting uses integer USD microdollars; old expense journals retain their original amounts.
Fractions accumulate per period and price before invoice-line reconciliation.
Billing-off instances do not enqueue Stripe usage events.

`storageUsed` is current capacity; the ledger keeps a monotonic chargeable peak
above the current allowance. Deleting recordings cannot reduce that period's
charge. Renewal persists the retained-storage baseline. Audio allowance is
reserved at acceptance and consumed once on successful transcription; enrichment retries reuse the
original transcript/receipt. Late callbacks settle against their original
period. Immediate upgrades preserve consumed allowance and charge only
additional storage units at the new tariff. Before a scheduled boundary opens
a new period, authoritative plan/allowance/tariffs are adopted together and one
retained-storage baseline is committed. Noncustomer included transcription
settles against its cumulative counter without creating monthly reset windows.
New reservations use `accountingMode: retail_only` and pin `includedSeconds` plus
`meterQuantity`; period `includedConsumedSeconds` distinguishes consumed
allowance from total `consumedSeconds`. Failed holds free allowance for future
work without repricing accepted receipts. Execution-policy snapshots
pin request limits without monetary provider-cost allocations. Financial
reversals and unknown settlement remain blocking; known legacy expense-only
reviews are preserved as evidence without suspending new retail usage.

`RetailUsageReservation` and `LegacyExpenseReservation` use the existing
`accountingMode` discriminator; accepted historical documents are not rewritten.
Legacy expense adapters retain settlement and archival readers but expose no new
processing/operator expense admission APIs. Execution models and physical limits
live with processing code rather than monetary-budget types.

New execution policies pin `plannerVersion: 2`; absent versions preserve the v1
planner for accepted work. Stored AI plans and response checkpoints remain the
authority on replay. Public recording responses derive `processingProgress`
(`transcriptAvailable` and `enrichmentState`) without another persisted status
machine. Notifications may include an `eventKey`; a partial unique index on
`userId` and string event keys leaves existing unkeyed notifications unchanged.

Local Better Auth uses separate adapter collections (`user`, `session`, `account`); these are distinct from application `users` profiles.
