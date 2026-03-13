# Admin Guide

Admin features live under `/admin` and require a user whose `role` is `admin`.

## Admin Routes

- `/admin`: overview dashboard and service health
- `/admin/users`: user search, role changes, usage edits, limit edits, disable/restore, and delete
- `/admin/users/[id]`: user detail view with recordings and invoice history
- `/admin/plans`: plan management and Stripe ID mapping
- `/admin/announcements`: create and manage user-facing announcements
- `/admin/settings`: global toggles such as signups, maintenance mode, and transcription multipliers
- `/admin/audit`: audit log viewer

## Dashboard

The dashboard shows:

- Total users
- Total recordings
- Total storage used
- Total transcription processed
- Service health cards for MongoDB, R2, Gemini, and other backend dependencies
- Orphaned recording cleanup when stale records are detected

Use this as the first stop when investigating platform-wide problems.

## User Management

From `/admin/users`, admins can:

- Search users
- Change user roles
- Disable or re-enable accounts
- Soft-delete and restore users
- Adjust storage or transcription limits
- Adjust reported usage values

Soft deletion behavior:

- The account is disabled immediately.
- Restore stays available until the configured deadline.
- Permanent cleanup is handled later by the retention/cleanup flow.

## User Detail View

The user detail page includes:

- Account profile information
- Current plan and usage snapshot
- User recordings
- Payment and invoice history

Use it for support and billing investigations that need more context than the table view.

## Plans And Billing Controls

The plan admin surface manages plan documents stored in MongoDB.

Each plan can define:

- Name and description
- Interval
- Price
- Storage and transcription limits
- Feature list
- Stripe base price ID
- Stripe metered storage and transcription price IDs

Billing behavior still depends on Stripe being configured correctly. The app does not create Stripe products for you.

## Global Settings

`/admin/settings` controls shared system behavior:

- `allowSignups`
- `maintenanceMode`
- `defaultPlanId`
- provider-specific transcription multipliers

These settings affect all workspaces, so treat them like operational config rather than personal preferences.

## Announcements

Announcements are system-wide messages displayed to users in the app.

Each announcement supports:

- Title
- Message
- Type: `info`, `warning`, `alert`, or `success`
- Active flag
- Start date
- Optional end date

Use them for maintenance notices, product changes, or urgent customer communication.

## Audit Logs

The audit page helps trace admin-side changes. Logs include:

- admin identity
- action type
- target resource type and ID
- details payload
- timestamp

This is the quickest way to understand who changed a plan, user, or system setting.

## Health Checks And Cleanup

The health dashboard tests real dependencies rather than only local state.

It currently covers the services that power:

- MongoDB access
- R2 storage
- Gemini
- other core backend integrations

Operational cleanup tasks include orphaned recording cleanup from the admin dashboard and retention cleanup from the scheduled cron route.

## Useful Scripts

These helper scripts exist in the repo today:

```bash
npx tsx scripts/check-db.ts
npx tsx scripts/check-user-stripe.ts
npx tsx scripts/debug-contacts.ts
npx tsx scripts/debug-transcripts.ts
npx tsx scripts/test-recording.ts
npx tsx src/scripts/backfill-contact-counts.ts
npx tsx src/scripts/fix-contact-stats.ts
```

## Recommended Admin Runbook

When something looks wrong:

1. Check `/admin` for service health and orphaned data.
2. Check `/admin/audit` for recent admin-side changes.
3. Inspect the affected user in `/admin/users` or `/admin/users/[id]`.
4. Verify Stripe, webhook, or transcription provider configuration if the issue is integration-related.
