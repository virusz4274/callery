# Scheduled jobs

Each endpoint is a `GET` handler requiring `Authorization: Bearer <CRON_SECRET>`.

| Endpoint | Schedule (UTC) | Work |
| --- | --- | --- |
| `/api/cron/process-exports` | Every 5 minutes | Claim a pending or stale export and upload archive parts |
| `/api/cron/process-usage` | Every 5 minutes | Retry persisted Stripe usage events; no-op with billing off |
| `/api/cron/cleanup-recordings` | Daily at 03:00 | Apply recording retention and retry expired account cleanup |
| `/api/cron/digest` | Daily at 08:00 | Send eligible weekly/monthly digests when email is configured |

Set a random `CRON_SECRET` in `.env`. `EXPORT_JOB_STALE_MINUTES` defaults to 90 and `SOFT_DELETE_RESTORE_DAYS` to 30.

Compose's `selfhost` profile includes a scheduler sidecar. For Compose with external MongoDB/storage, enable it with `--profile scheduler`. It waits for app health and requires `CRON_SECRET`. Container startup still needs a smoke test on a machine with Docker Engine.

The endpoint schedules also appear in `vercel.json`. Other deployments need a scheduler calling these URLs with the bearer header. Workers Cron Triggers need an HTTP caller because these are route handlers.

Auto-transcription and support delivery use Next.js `after(...)` and are process-bound. Exports and billing delivery keep persisted retry state. Failed storage cleanup retains object metadata for retry. Deletion frees capacity without lowering the period's storage peak.
