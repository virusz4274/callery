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
- `/admin/plans`: installation/draft plan definitions and Stripe catalog import, review and publication
- `/admin/announcements`: system announcement management
- `/admin/settings`: shared platform settings
- `/admin/audit`: admin action log

## Dashboard

The dashboard is the operational overview for the platform. It currently surfaces:

- total users
- total recordings
- total storage used
- total transcription used
- live health for MongoDB and S3 storage, plus configuration status for the selected text AI and available transcription providers
- open external service incidents
- orphaned recording cleanup

Health checks ping MongoDB and check the configured S3 bucket with `HeadBucket`.
Text AI and transcription services report available configuration without making
paid provider calls. Use the provider dashboards to investigate live quota or
request failures.

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

Installation and draft plans are stored in MongoDB and managed through
`/admin/plans`. They are separate from the immutable published Stripe catalog
that controls managed purchases and customer usage tariffs.

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

`pnpm db:init` inserts missing templates with empty Stripe IDs. Starter offers
are Standard USD 10/month with 60 weighted minutes and 2 GiB, Pro USD 20/month
with 120 minutes and 5 GiB, and Lifetime USD 250 once with no recurring allowance.
Reruns preserve existing definitions, IDs, settings and financial records.
Changing a draft or pasting a Price ID does not publish an offer.

For managed sales, create the Stripe products, base prices and four usage meter
prices, then use the **Stripe catalog** panel to import a complete draft,
review authoritative amounts and structural validation, and publish it. The import
template and installation seeds share the same allowance defaults. Published
snapshots supply public pricing, checkout and billing settings; historical
snapshots remain available for existing receipts and subscriptions.

A fresh installation shows an unpublished-pricing warning and rejects paid
checkout. Publication requires valid Stripe structure and mappings; live
collection additionally requires reviewed sandbox payment, metering, accounting,
processing-limit and storage/recovery acceptance. Profitability reports,
provider-cost attestations and monetary operator budgets are not required.
Included resources use the paid entitlement and allowance; extra usage needs
prepaid retail credit. See
[billing](billing.md) for first setup and later price changes. Catalog actions
and acceptance refreshes are audited. Webhooks refresh discovery without
automatically publishing prices.

## Global Settings

`/admin/settings` controls platform-wide behavior:

- `allowSignups`
- `maintenanceMode`
- `processingPaused` (optional audited manual pause; false by default)
- `defaultPlanId`
- self-hosted transcription multipliers for Soniox, ElevenLabs, Gemini, and Compatible server

Self-hosted multiplier controls show explicit stored overrides, falling back
to environment defaults when a value is absent. Fresh initialization omits
optional overrides. Values must be finite and positive; fractions such as
`0.25` are supported. Changes affect future jobs, preserving accepted receipts.

Managed weights are read-only: Soniox 1×, Gemini 3× and ElevenLabs 5×, using
approved models. The settings action rejects multiplier edits in managed mode;
existing self-hosted overrides cannot change managed estimates or admission.
Managed onboarding must reference an active Free Trial plan. Self-hosted
onboarding may reference any existing active plan. Invalid defaults are rejected
when saving settings and creating a profile; existing entitlements are preserved.
Free Trial is granted once for 30 days with 10 weighted minutes and 100 MiB;
it does not renew with a calendar month or another login. Internal has no minute
quota and includes 1 TiB storage. Internal can be assigned to any user without
granting administrator permissions. It is free and Stripe-independent; provider
request/retry/concurrency limits and account restrictions remain enforced.
Custom keeps assigned quotas, features and expiry. Trial, Internal and Custom
have no hidden provider-dollar budgets. Administrative assignment does not
resolve debt, disputes or uncertain financial settlement.

Use `processingPaused` to pause provider calls manually without marking customers
unpaid or starting media deletion. Check provider dashboards for cost/usage
alerts. Routine price changes use noticed Stripe Subscription Schedule phases;
upgrades apply after payment, and downgrades at renewal. New prepaid grants cover
all approved metered usage and do not require expiry/reissue for new Prices.

These settings apply to every workspace on the instance.
If `system_settings` is missing, the page fails with an initialization message
instead of silently recreating defaults. Inspect with `pnpm db:init --dry-run`,
then run `pnpm db:init` to add missing data. Duplicate settings or conflicting
indexes are structural errors and require explicit correction. The initializer
does not overwrite customization or choose between duplicate documents.

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

## Command-Line Checks

Inspect initialization state without changing the database:

```bash
pnpm db:init --dry-run
pnpm audit:prod
```

The dry-run reports missing installation templates and indexes, structural
conflicts, and local billing catalog configuration. Run `pnpm db:init` only when
you intend to add missing installation data. `pnpm audit:prod` checks production
dependencies against the package registry; it does not inspect application data.

Use `/admin` for service health, `/admin/audit` for administrative changes, and
`/admin/users/[id]` for a specific account's plan, usage, and recording context.
The old ad-hoc scripts that dumped customer content or inserted fabricated
recordings have been retired. Development fixture tests use isolated databases
and storage; see the [setup guide](setup-guide.md).

## Recommended Admin Runbook

When something is wrong:

1. Open `/admin` and review service health and open incidents.
2. Check `/admin/audit` for recent platform-side changes.
3. Inspect the affected user in `/admin/users` or `/admin/users/[id]`.
4. Clear incidents only after you understand the root cause.
5. Verify Stripe, transcription provider, webhook, or SMTP configuration if the issue crosses an external boundary.
