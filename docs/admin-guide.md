# Admin Guide

Admin features live under `/admin` and require a user whose role is `admin`.

Both deployment types use Better Auth with MongoDB. Set `ADMIN_EMAILS` to bootstrap
admins after verified authentication, including email-verification completion.
Configure SMTP or Resend for deployed verification and recovery; `EMAIL_PROVIDER=none`
automatically verifies addresses for testing. Disabled or deleted profiles cannot
access product APIs through existing cookies, bearer sessions or limited sync tokens.

## Admin Routes

- `/admin`: dashboard, health checks, incidents, and cleanup actions
- `/admin/users`: user search and account mutations
- `/admin/users/[id]`: detailed user view with recordings and billing context
- `/admin/plans`: plan CRUD and Stripe price mapping
- `/admin/announcements`: system announcement management
- `/admin/settings`: shared platform settings
- `/admin/audit`: admin action log

## Dashboard

The dashboard is the operational overview for the platform. It currently surfaces:

- total users
- total recordings
- total storage used
- total transcription used
- health status for MongoDB, R2, Gemini, Soniox, and ElevenLabs
- open external service incidents
- orphaned recording cleanup

The health checks are code-backed, not static status text. MongoDB is pinged directly and Gemini performs a real embedding call. R2 currently checks whether the bucket configuration is present, while Soniox and ElevenLabs currently report configured-vs-missing API keys rather than making paid health probes.

## User Management

From `/admin/users`, admins can:

- search users
- change roles
- disable or re-enable accounts
- soft-delete users
- restore soft-deleted users during the restore window
- edit storage and transcription allocations
- edit reported usage values

Soft deletion preserves restore state in the user document and defers final cleanup to the retention flow.
The restore window defaults to `30 days` and is controlled by `SOFT_DELETE_RESTORE_DAYS`.

## User Detail View

`/admin/users/[id]` is the support-oriented drill-down view. It includes:

- profile details
- plan and usage information
- recording history
- invoice history when Stripe is configured

Use it when the table view is not enough to diagnose a customer issue.

## Plans

Plans are stored in MongoDB and managed through `/admin/plans`.

Each plan document can define:

- stable internal key and display name
- name and description
- price, currency, and interval
- included storage and transcription limits
- feature list
- Stripe base price ID (`stripePriceId`)
- Stripe metered storage price ID (`stripeStoragePriceId`)
- Stripe metered transcription price ID (`stripeTranscriptionPriceId`)
- active/default state

The app does not create Stripe products for you. The admin UI is where you map existing Stripe prices to plan documents.
The public pricing page only publishes plans that are active, non-default, and have a non-empty `stripePriceId`.

> [!IMPORTANT]
> **After a fresh `npm run db:init`, all plan price IDs are empty strings.** No user can complete checkout until you fill them in here. Go to `/admin/plans`, edit each paid plan (Standard, Pro, Lifetime), and paste the corresponding Stripe Price IDs. See [billing.md](billing.md) for step-by-step instructions on creating those prices in Stripe.
>
> The pricing page shows a configuration warning (rather than plan cards) when all plans have empty price IDs, so it is immediately obvious if this step was skipped.

## Global Settings

`/admin/settings` controls platform-wide behavior:

- `allowSignups`
- `maintenanceMode`
- `defaultPlanId`
- transcription multipliers for Soniox and ElevenLabs

These settings apply to every workspace on the instance.
If `system_settings` is missing on a fresh database, the page now fails with an initialization message instead of silently recreating defaults. Run `npm run db:init` to restore the required seed data.

## Announcements

Announcements are system-wide notices shown in the app.

Each announcement supports:

- title
- message
- type: `info`, `warning`, `alert`, `success`
- active flag
- start date
- optional end date

Use them for maintenance windows, product notices, or urgent customer communication.

## Audit Logs

`/admin/audit` shows the `admin_logs` collection.

Entries capture:

- admin identity
- action name
- target type and target ID
- details payload
- timestamp

Actions from user, plan, announcement, settings, and incident workflows are recorded here.

## Incidents And Email Testing

The dashboard can also help resolve operational backlog.

Admins can:

- clear one external service incident
- clear all open external service incidents
- send an SMTP test email from the admin surface

## Useful Scripts

Current helper scripts in the repo:

```bash
npm run db:init
npm run audit:prod
npx tsx scripts/check-db.ts
npx tsx scripts/check-user-stripe.ts
npx tsx scripts/debug-contacts.ts
npx tsx scripts/debug-transcripts.ts
npx tsx scripts/test-recording.ts
```

## Recommended Admin Runbook

When something is wrong:

1. Open `/admin` and review service health and open incidents.
2. Check `/admin/audit` for recent platform-side changes.
3. Inspect the affected user in `/admin/users` or `/admin/users/[id]`.
4. Clear incidents only after you understand the root cause.
5. Verify Stripe, transcription provider, webhook, or SMTP configuration if the issue crosses an external boundary.
