# Admin Guide

Admin features are available under `/admin` and require a user with `admin` role.

## Admin Routes

- `/admin`: overview dashboard and health summary
- `/admin/users`: user management
- `/admin/plans`: plan and Stripe ID management
- `/admin/settings`: global toggles (maintenance mode, multipliers, signup policy)
- `/admin/announcements`: user-facing announcement management
- `/admin/audit`: audit log viewer

## Operational Areas

### System Health

Dashboard checks include MongoDB, R2, transcription providers, and AI service availability.

### Plan and Billing Controls

- Create/update plans
- Set Stripe price IDs for base + metered items
- Adjust transcription multipliers (e.g. Soniox vs ElevenLabs)

### User Operations

- Inspect user usage and subscription state
- Apply manual usage adjustments when needed
- Review account-level metadata for troubleshooting
- User deletion is soft-delete first:
  - Account is disabled immediately.
  - Restore is available until the configured deadline.
  - Expired soft-deleted accounts are permanently purged by the cleanup cron.

### Maintenance Controls

Enable maintenance mode to restrict non-admin access during incidents/deployments.

## File and Upload Tools

- `/files`: browse stored files
- `/upload`: manual upload/testing path

## Useful Scripts

Run with `npx tsx scripts/<name>.ts`:
- `check-db.ts`
- `check-user-stripe.ts`
- `debug-contacts.ts`
- `debug-transcripts.ts`
- `test-recording.ts`
