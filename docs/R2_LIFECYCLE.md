# Cloudflare R2 Lifecycle Policy

To prevent storage costs from accumulating, you should configure a lifecycle rule to automatically delete export archives after 7 days.

## Instructions

1.  **Log in** to your [Cloudflare Dashboard](https://dash.cloudflare.com).
2.  Navigate to **R2** and select your bucket (e.g., `call-memo-storage`).
3.  Click on the **Settings** tab.
4.  Scroll down to the **Object Lifecycle** section.
5.  Click **Add Rule**.
6.  Configure the rule as follows:
    *   **Rule Name**: `Delete Exports after 7 Days`
    *   **Apply to**: `Prefix`
    *   **Prefix**: `exports/`
    *   **Action**: `Delete object`
    *   **Duration**: `7 days`
7.  Click **Create Rule**.

## Verification
Any file uploaded to the `exports/` folder will now be automatically deleted by Cloudflare 7 days after its creation. This matches the 7-day expiration we set for the download links in the application.

---

# Automatic Recording Deletion Policy

Users can configure an automatic deletion policy in Settings > Data > Usage & Storage. Recordings older than the configured policy threshold are automatically deleted.

## How It Works

The application exposes a protected API endpoint that performs the cleanup:

```
GET /api/cron/cleanup-recordings
Authorization: Bearer YOUR_CRON_SECRET
```

This endpoint:
1. Queries users with active deletion policies (`3m`, `6m`, `1y`)
2. Finds recordings older than each user's policy threshold
3. Deletes from MongoDB and R2
4. Updates user storage statistics

## Environment Variable

Add `CRON_SECRET` to your environment:

```bash
# Generate a secure random token
CRON_SECRET=your-secure-random-token-here
```

## Triggering the Cleanup

### Vercel (Automatic)

When deployed to Vercel, the `vercel.json` cron configuration automatically triggers the endpoint daily at 3 AM UTC:

```json
{
  "crons": [
    {
      "path": "/api/cron/cleanup-recordings",
      "schedule": "0 3 * * *"
    }
  ]
}
```

### Docker / Self-Hosted

Add a cron job to your host system or use a container scheduler:

```bash
# Example: Add to crontab (runs daily at 3 AM)
0 3 * * * curl -X GET https://your-app-url/api/cron/cleanup-recordings -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Or use an external service like:
- [cron-job.org](https://cron-job.org)
- [EasyCron](https://www.easycron.com)
- AWS EventBridge
- Google Cloud Scheduler

### Manual Testing

```bash
curl -X GET http://localhost:9000/api/cron/cleanup-recordings \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Expected response:
```json
{
  "success": true,
  "message": "Deleted 5 expired recording(s)",
  "deleted": 5,
  "users": 2,
  "r2Errors": 0
}
```

---

# Export Processing Worker

Exports are processed by a durable queue worker endpoint, not by in-request timers.

## Endpoint

```
GET /api/cron/process-exports
Authorization: Bearer YOUR_CRON_SECRET
```

This endpoint:
1. Claims one queued export job (`pending`) or a stale `processing` job.
2. Runs the export processor.
3. Updates job progress/checkpoints and final download links.

## Optional Worker Tuning

```bash
# Reclaim 'processing' jobs if no update for N minutes (default: 90)
EXPORT_JOB_STALE_MINUTES=90
```

## Triggering the Export Worker

### Vercel (Automatic)

`vercel.json` includes:

```json
{
  "crons": [
    {
      "path": "/api/cron/process-exports",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

### Docker / Self-Hosted

```bash
# Every 5 minutes
*/5 * * * * curl -X GET https://your-app-url/api/cron/process-exports -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### Manual Testing

```bash
curl -X GET http://localhost:9000/api/cron/process-exports \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Expected responses:
```json
{ "success": true, "message": "No queued export jobs" }
```

or

```json
{
  "success": true,
  "message": "Processed export job",
  "jobId": "65f2...",
  "firebaseUid": "abc123",
  "status": "completed"
}
```
