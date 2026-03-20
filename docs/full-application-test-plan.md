# Full Application Test Plan

This document is the manual QA handoff for the current Call Memo application.

## Recommended Test Environment

Use a production-like staging deployment whenever possible:

- `npm run build`
- `npm start`
- staging-only infrastructure and secrets
- real HTTPS origin if available
- Stripe test mode
- real R2, MongoDB, and Firebase staging resources

Avoid `npm run dev` for formal handoff unless a developer is actively debugging alongside the tester.

## Before Testing Starts

Confirm:

- the app builds successfully
- Firebase auth is connected to the test environment
- MongoDB points to staging, not production
- R2 uploads work from the staging origin
- webhook endpoints are reachable if those flows are in scope
- billing is either intentionally enabled or intentionally disabled
- cron routes are configured with `CRON_SECRET`

## Accounts To Prepare

Prepare:

- one brand-new user
- one returning non-admin user
- one admin user
- one billing-enabled user with an existing Stripe customer
- one user with no Stripe customer
- one user near storage or transcription limits

## Test Data To Prepare

Prepare these files:

- one short valid recording
- one longer speech recording
- one duplicate file
- one unsupported file type
- one file large enough to exercise upload progress

Prepare these states:

- at least one contact-linked recording
- at least one recording with a completed transcript
- at least one recording without a transcript
- at least one shared recording if sharing is enabled

## Critical Route Checklist

Public routes:

- `/`
- `/pricing`
- `/support`
- `/maintenance`
- `/privacy-policy`
- `/terms-of-service`
- `/changelog`
- `/login`
- `/signup`
- `/forgot-password`
- `/reset-password`
- `/~offline`

Authenticated routes:

- `/recordings`
- `/contacts`
- `/contacts/[id]`
- `/files`
- `/upload`
- `/settings`
- `/support`

Admin routes:

- `/admin`
- `/admin/users`
- `/admin/users/[id]`
- `/admin/plans`
- `/admin/announcements`
- `/admin/settings`
- `/admin/audit`

Android-only route when testing a device build:

- `/android-sync`

Public signed route when sharing is in scope:

- `/s/[token]`

## Test Order

1. Public pages and auth
2. Authenticated navigation
3. Upload and recording creation
4. Recordings search, playback, and sharing
5. Contacts and files
6. Settings, export, notifications, and support
7. Billing
8. Admin
9. Regression pass on the most critical flows

## Core Scenarios

### Auth

Verify:

- signup creates a usable account
- login works with email/password
- Google sign-in works when enabled
- logout clears access to protected routes
- refresh preserves the session

### Uploads

Verify:

- supported audio files can initialize and complete upload
- direct upload writes the recording to the archive
- duplicate handling is understandable to the user
- unsupported files fail cleanly
- over-limit uploads show a clear error

### Recordings

Verify:

- listing, filtering, and pagination work
- search returns results
- semantic search does not hard-fail the page when embeddings are unavailable
- saved views and smart collections update the URL and result set correctly
- playback works
- starring, archiving, and tagging persist
- manual transcription can be triggered

### Sharing

Verify:

- full-recording share link creation works
- clip share creation works
- shared pages open under `/s/[token]`
- expired or invalid links fail safely

### Contacts And Files

Verify:

- contacts list loads
- contact detail pages show linked recordings
- file browser renders the recording tree
- delete flows are gated and intentional

### Settings

Current tabs to verify:

- `Profile`
- `General`
- `Sources`
- `Processing`
- `Retention`
- `Export`
- `Notifications`
- `Billing` when billing is enabled

Checks:

- timezone and profile changes persist
- Google Contacts connect/sync flow works when configured
- auto-transcription and provider settings persist
- deletion policy can be changed
- export jobs start and finish, with only one active job allowed per user
- notification preferences save

### Support

Verify:

- `/support` accepts valid submissions
- invalid payloads are rejected
- rapid repeat submissions hit rate limiting
- honeypot submissions are rejected
- the request is stored even when SMTP is not configured
- email delivery is queued when `SUPPORT_EMAIL` is configured

### Billing

Verify:

- the Billing tab is hidden when billing is disabled
- Checkout opens for paid plans
- portal opens for existing Stripe customers
- invoice history loads
- overage toggle persists
- webhook-driven subscription state changes sync back into the app

### Admin

Verify:

- dashboard loads service health and counts
- incidents appear and can be cleared
- failed async jobs can be retried
- SMTP test email works when mail is configured
- user search and mutations work
- plan CRUD works
- announcements appear correctly in the user UI
- settings changes take effect
- audit log entries are created

### Android-Specific QA

If an Android build is being tested, verify:

- the device can reach the configured server URL
- `/android-sync` can pick a folder
- file discovery works
- selected files sync successfully
- background sync progress updates
- cancellation works
- mobile sync still works after Firebase bearer tokens would normally expire, while the sync-session token remains valid

## Severity Guide

- `P0`: data loss, auth bypass, security issue, billing corruption, or total outage
- `P1`: major feature broken, uploads fail, login broken, or admin controls unusable
- `P2`: partial feature break, bad validation, incorrect UI state, misleading messaging
- `P3`: cosmetic or low-impact issues

## Bug Report Template

Each report should include:

- title
- environment URL
- account used
- exact route
- exact reproduction steps
- expected result
- actual result
- screenshot or recording
- browser or device
- timestamp with timezone
- severity guess

Suggested title format:

`[Area] Short description`
