# Cron Jobs Setup

Vosift only uses scheduled cron endpoints for export processing and retention cleanup. Both routes are standard `GET` handlers protected by `CRON_SECRET`.

## Cron Endpoints

### `GET /api/cron/process-exports`

Picks up the next pending data-export job (status `pending`) and processes it. Each invocation handles one job.

- **Schedule:** Every 5 minutes.
- **What it does:** Claims a pending or stale export, packages the user's recordings and metadata, uploads the archive to R2, and marks the job `completed` or `failed`.
- **Stale job recovery:** If a job is stuck in `processing` longer than `EXPORT_JOB_STALE_MINUTES`, the next cron run can reclaim it.

### `GET /api/cron/cleanup-recordings`

Enforces automatic deletion policies across all users.

- **Schedule:** Daily at 3:00 AM UTC.
- **What it does:**
  1. Finds recordings past their auto-delete date and deletes them from both R2 and MongoDB.
  2. Decrements each affected user's `storageUsed` counter.
  3. Permanently purges user accounts that were soft-deleted more than `SOFT_DELETE_RESTORE_DAYS` ago.

## What No Longer Uses Cron

- Auto-transcription now starts immediately after upload finalization with Next.js `after(...)`.
- Support email delivery now runs with `after(...)` after the support request is accepted.
- There is no generic async job queue or worker system.

## Deployment Scenarios

### Vercel

If you deploy to Vercel, the schedules are defined in [`vercel.json`](../vercel.json):

```json
{
  "crons": [
    {
      "path": "/api/cron/cleanup-recordings",
      "schedule": "0 3 * * *"
    },
    {
      "path": "/api/cron/process-exports",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

Vercel sends `Authorization: Bearer <CRON_SECRET>` automatically when invoking these routes.

### Docker Compose

The included [`docker-compose.yml`](../docker-compose.yml) defines a `cron` sidecar that runs BusyBox `crond` inside `alpine:3.20` and calls the app service directly:

```cron
*/5 * * * *  wget -qO- --header="Authorization: Bearer ${CRON_SECRET}" http://app:3000/api/cron/process-exports >/dev/null 2>&1
0 3 * * *    wget -qO- --header="Authorization: Bearer ${CRON_SECRET}" http://app:3000/api/cron/cleanup-recordings >/dev/null 2>&1
```

The sidecar uses `TZ=UTC` and depends on the `app` service.

### Other Self-Hosted Schedulers

If you are not using the provided Compose setup, configure any scheduler to make `GET` requests with the cron bearer token:

```bash
curl -X GET https://your-domain.com/api/cron/process-exports \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

curl -X GET https://your-domain.com/api/cron/cleanup-recordings \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

## Environment Variables

| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `CRON_SECRET` | **Yes** | — | Shared secret used to authenticate cron requests. Generate with `openssl rand -hex 32`. |
| `EXPORT_JOB_STALE_MINUTES` | **Yes** | `90` | Minutes before a stuck `processing` export job is considered stale and can be reclaimed. |
| `SOFT_DELETE_RESTORE_DAYS` | **Yes** | `30` | Days a soft-deleted user account can be restored before permanent purge. |

## Relevant Documentation

- [docs/api-reference.md](api-reference.md) — Full endpoint reference including cron routes.
- [docs/setup-guide.md](setup-guide.md) — Initial setup including `CRON_SECRET` configuration.
- [docs/architecture.md](architecture.md) — System architecture overview.
