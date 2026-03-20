# Cron Jobs Setup

Vosift uses three scheduled cron endpoints for background work. All three are standard `GET` route handlers protected by the `CRON_SECRET` environment variable.

---

## Cron Endpoints

### `GET /api/cron/process-exports`

Picks up the next pending data-export job (status `pending`) and processes it. Each invocation handles **one job** so it stays within serverless execution limits.

- **Schedule:** Every 5 minutes.
- **What it does:** Claims a queued export, zips the user's recordings along with metadata, uploads the `.zip` to R2 under `exports/`, and marks the job as `completed` (or `failed`).
- **Stale job recovery:** If a job has been stuck in `processing` for longer than `EXPORT_JOB_STALE_MINUTES`, the cron considers it stale and re-claims it.

### `GET /api/cron/cleanup-recordings`

Enforces automatic deletion policies across all users.

- **Schedule:** Daily at 3:00 AM UTC.
- **What it does:**
  1. Finds recordings past their auto-delete date and deletes them from both R2 and MongoDB.
  2. Decrements each affected user's `storageUsed` counter.
  3. Permanently purges user accounts that were soft-deleted more than `SOFT_DELETE_RESTORE_DAYS` ago (deletes their R2 files and MongoDB documents).

### `GET /api/cron/process-async-jobs`

General-purpose async job runner. Picks up and processes the next queued async job (e.g., background transcription retries, email delivery).

- **Schedule:** Not included in `vercel.json` by default — call it on-demand or add it to your scheduler if needed.

---

## Deployment Scenarios

### Vercel (Automatic)

If you deploy to Vercel, cron jobs are handled automatically. The schedules are defined in [`vercel.json`](../vercel.json):

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

Vercel automatically sends the `CRON_SECRET` as the `Authorization: Bearer` header when invoking these routes. You only need to set `CRON_SECRET` in your Vercel environment variables.

> [!NOTE]
> On Vercel's free (Hobby) plan, cron jobs can run at most once per day. The `*/5 * * * *` schedule for `process-exports` will only work on the Pro plan or higher. On Hobby, you can work around this by setting `EXPORT_INLINE_PROCESSING=true` (see below).

### Docker / Self-Hosted / External Scheduler

If you are **not** on Vercel, you need to set up an external scheduler to call these endpoints. Use any cron service you prefer (system crontab, cron-job.org, AWS EventBridge, GCP Cloud Scheduler, etc.).

**Configure each job to make a `GET` request with the auth header:**

```bash
# Process exports — every 5 minutes
curl -X GET https://your-domain.com/api/cron/process-exports \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

# Cleanup recordings — daily at 3 AM
curl -X GET https://your-domain.com/api/cron/cleanup-recordings \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

# Async jobs (optional) — every 10 minutes, or as needed
curl -X GET https://your-domain.com/api/cron/process-async-jobs \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

**Example using system crontab:**

```cron
*/5 * * * *  curl -sS -X GET https://your-domain.com/api/cron/process-exports -H "Authorization: Bearer YOUR_CRON_SECRET"
0 3 * * *    curl -sS -X GET https://your-domain.com/api/cron/cleanup-recordings -H "Authorization: Bearer YOUR_CRON_SECRET"
```

---

## Environment Variables

| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `CRON_SECRET` | **Yes** | — | Shared secret used to authenticate all cron requests. Generate with `openssl rand -hex 32`. |
| `EXPORT_JOB_STALE_MINUTES` | **Yes** | `90` | Minutes before a stuck `processing` export job is considered stale and can be re-claimed by the next cron run. |
| `EXPORT_INLINE_PROCESSING` | **Yes** | `false` | When `true`, exports are processed immediately in-line (using the Next.js `after()` hook) instead of waiting for the cron to pick them up. Useful for development or Vercel Hobby plans where cron frequency is limited. |
| `SOFT_DELETE_RESTORE_DAYS` | **Yes** | `30` | Number of days a soft-deleted user account can be restored before the cleanup cron permanently purges it. |

---

## Inline Processing (Alternative to Cron)

For local development or simple setups where you don't want to configure a scheduler, set:

```env
EXPORT_INLINE_PROCESSING=true
```

With this enabled, when a user clicks "Export", the job runs immediately in the background using Next.js's `after()` hook — no cron needed. In development mode (`NODE_ENV=development`), inline processing is always enabled regardless of this flag.

> [!IMPORTANT]
> For production deployments with multiple concurrent users, the cron-based approach is recommended. Inline processing ties the export to the original request's serverless function, which may time out for large exports.

---

## Relevant Documentation

- [docs/api-reference.md](api-reference.md) — Full endpoint reference including cron routes.
- [docs/setup-guide.md](setup-guide.md) — Initial setup including `CRON_SECRET` configuration.
- [docs/architecture.md](architecture.md) — System architecture overview.
