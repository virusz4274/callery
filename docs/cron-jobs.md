# Scheduled jobs

Each endpoint is a `GET` handler requiring `Authorization: Bearer <CRON_SECRET>`.

| Endpoint | Schedule (UTC) | Work |
| --- | --- | --- |
| `/api/cron/process-exports` | Every 5 minutes | Generate/recover cached exports; delete expired archives and orphaned write intents |
| `/api/cron/process-usage` | Every 5 minutes | Repair receipts/outboxes, reconcile prepaid funds and plan changes, verify schedule boundaries and meters/invoices, recover historical financial operations, enforce recovery and financial settlement; no-op with billing off |
| `/api/cron/process-ingestion` | Every 5 minutes | Recover uploads, process persisted transcription work, abort expired sessions, and retry object cleanup |
| `/api/cron/cleanup-recordings` | Daily at 03:00 | Apply recording retention and retry expired account cleanup |
| `/api/cron/digest` | Daily at 08:00 | Send eligible weekly/monthly digests when email is configured |

Set a random `CRON_SECRET` in `.env`. `EXPORT_JOB_STALE_MINUTES` defaults to 30 and `SOFT_DELETE_RESTORE_DAYS` to 30.

Compose's `selfhost` profile includes a scheduler sidecar. For Compose with external MongoDB/storage, enable it with `--profile scheduler`. It waits for app health and requires `CRON_SECRET`. Container startup still needs a smoke test on a machine with Docker Engine.

These are the schedules configured in `vercel.json` and Compose, not timers started
by the application itself. Other deployments need a scheduler calling these URLs
with the bearer header. Workers Cron Triggers need an HTTP caller because these
are route handlers.

Export cron and development processing share an atomic worker claim and heartbeat. Cron can resume a stale worker within the two-generation-attempt limit. A job already marked failed requires the user's **Retry export** action; cron does not automatically spend its remaining attempt. Retried jobs keep their original archive identity and fresh-export window. Cleanup claims expired archives and abandoned writes before deleting their bytes, so it cannot delete a renewed part based on an old scan.

Each export cron request cleans up due work and processes at most one claimed
archive. Its declared route duration is 300 seconds; the hosting platform still
controls the actual request/runtime limit. A large archive may require later
invocations to recover its saved checkpoints.

Transcription uses a durable MongoDB queue and shared dispatch slot. Next.js `after(...)` wakes it after uploads, batch actions, and provider callbacks; ingestion cron recovers interrupted work and continues approved batches. Unapproved bulk imports and saved batches remain waiting. See [Transcription batches](transcription-batches.md). Support delivery remains process-bound. Exports and billing delivery keep persisted retry state. Failed storage cleanup retains object metadata for retry. Deletion frees capacity without lowering the period's storage peak.
