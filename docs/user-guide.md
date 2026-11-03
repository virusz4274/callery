# User Guide

This guide reflects the current user-facing workflow in the app.

## Signing In

- Email/password sign-in uses Better Auth on every instance.
- Google sign-in appears when configured for the instance.
- Successful sign-in creates an authenticated workspace session.
- With SMTP or Resend, signup shows a check-email confirmation before login.
  Verification links preserve the requested workspace destination.
- Password changes require a linked email/password account. Google-only users
  do not see current-password controls. Recovery is unavailable with testing
  email configuration (`EMAIL_PROVIDER=none`). Password resets revoke sessions.

Main authenticated areas:

- `/recordings`
- `/transcription` (with bulk import at `/transcription/import`)
- `/contacts`
- `/files`
- `/upload`
- `/settings`
- `/support`

The web app works on desktop/mobile browsers and as a PWA. Native Android work is archived.

## Uploading Recordings

The primary upload flow lives on `/upload`.

What happens during upload:

1. The app validates the file name, MIME type, and size.
2. The browser requests an upload session and URL.
3. File bytes go directly to S3-compatible storage when verified signed-length uploads are configured; otherwise, the app streams them to storage with a size limit.
4. The app finalizes the upload, verifies the object and size, creates the recording, and optionally starts auto-transcription after the response.

If the filename contains a recognizable contact name, phone number, or timestamp, the uploader uses that to pre-fill the recording context and storage key.

Current limits:

- maximum upload size: `5 GiB`
- maximum transcription-eligible size: `2 GiB`
- supported formats: `mp3`, `wav`, `m4a`, `mp4`, `webm`

Files larger than the transcription limit still upload and remain playable.

## Recordings Workspace

`/recordings` is the main archive view. Users can:

- browse and paginate recordings
- filter by contact and recording date, and sort by date or duration
- search by text or semantic meaning
- save custom views locally in the browser
- apply the `Recent week`, `Longest calls`, and `Needs transcription` collections; `Recent week` uses the recording date
- open a recording detail view
- request manual transcription
- generate signed share links

The main recording list excludes archived recordings. The data model and update
action retain tags and star/archive fields, but the current web interface does not
expose controls for editing or filtering them.

Recording detail state can include:

- playback
- transcript segments with speaker labels
- summary
- transliteration output when available
- transcription provider metadata
- sharing controls

## Transcription Workspace

Open **Transcription → Bulk import** to upload recordings without starting provider
processing. On `/transcription`, select waiting recordings to start a batch or save
it for later. Saved batches can be started, paused, and resumed explicitly; finishing
one does not start another saved draft. Other batches already started remain
eligible for processing. See [transcription batches](transcription-batches.md)
for processing limits, saved-transcript recovery, and uncertain provider outcomes.

## Sharing

The app supports signed public links under `/s/[token]`.

Users can create:

- full-recording share links
- clipped share links with optional start and end seconds

Available expiration windows in the current action flow:

- `1 hour`
- `24 hours`
- `7 days`

Recipients do not need an account.

Public sharing is disabled in a company archive, including links issued before
company mode was enabled. Administrators use **Company recordings** instead.

## Contacts

`/contacts` is the relationship-focused view of the archive.

Users can:

- search contacts
- open a contact detail page
- review linked recordings for a person or company
- sync Google Contacts from Settings

Contact records track aggregate information such as total recordings and last recording date so the app can use contacts as an index into the archive. In **Settings → Sources**, **Connect Google** opens a separate Contacts authorization flow and starts the initial sync in the background. Once connected, **Sync now** waits for a refresh to finish. **Disconnect** removes the saved connection while keeping the last synced contacts until a future sync replaces them. Shared phone numbers appear as review items to resolve in Google Contacts. The sign-in identity and Contacts consent are separate, even when both use the same Google Cloud project.

## Files

`/files` shows a storage-oriented view derived from recording keys.

Use it when you want to:

- browse the archive like a folder tree
- inspect recordings from their storage path
- clean up intentionally through the file browser workflow

This is different from `/recordings`, which is optimized for retrieval and search. The file browser can also open a recording detail dialog or launch the single-item delete flow from the storage view.
Company members cannot permanently delete recordings through this or any other view.

## Settings

The current settings tabs are:

- `Profile`: name, password changes, and account details
- `General`: timezone
- `Sources`: Google Contacts connection state
- `Processing`: auto-transcription and its default provider
- `Integrations`: named API tokens and upload/sync client access
- `Retention`: usage review and automatic deletion policy
- `Export`: archive export jobs and downloads
- `Notifications`: digest and ingest preferences
- `Billing`: plan, usage, invoices, portal, and checkout when billing is enabled

Notable settings behavior:

- deletion policy values are `never`, `3m`, `6m`, and `1y`
- export jobs create downloadable archive parts and an offline viewer
- billing is hidden unless `NEXT_PUBLIC_ENABLE_BILLING=true`
- billing controls appear under the `Billing & Plans` panel title when enabled

In a company archive, **Processing** and **Retention** show the administrator's
policy instead of personal editing controls. **Integrations** creates scoped API
tokens for clients, displays each new secret once, and lets you rotate or revoke
tokens separately; see [integration setup](integration-api.md).

## Exports

Exports are designed to stay useful outside the app.

Each export job packages:

- zipped archive parts stored in the instance's private S3-compatible storage
- recordings grouped by contact and date
- JSON metadata
- transcript text files
- a `viewer.html` file for offline browsing

Only one pending or processing export job is allowed per user at a time.

One fresh full archive is available per 24 hours. If a storage transfer fails, **Retry export** resumes the same job once without starting a new quota window. Saved archive parts are reused only after verification. Retry is unavailable if the recordings changed, the archive expired, access was removed, or both generation attempts were used; the export panel explains the reason. Individual recording downloads remain available.

Archive parts are retained for seven days after completion. Download links last 15 minutes; reopen the export panel for fresh links.

Extract every archive part into the same folder, then open `viewer.html`. If the
browser asks for a directory, select the extracted `Contacts` folder. An export
contains your recording library; complete deployment backup and restore require
the [database, bucket, and configuration backups](small-team-setup.md#back-up-the-complete-deployment).

## Notifications

The notification center can show:

- transcription completion or failure
- export completion
- billing-related notices

If VAPID keys are configured, users can also register browser push notifications.
Administrator announcements appear separately as workspace notices.

## Billing

When billing is enabled, users can:

- review the active plan
- see storage and transcription usage
- enable or disable overage
- start Stripe Checkout
- open the Stripe customer portal
- review invoice history

If billing is disabled for the deployment, these controls are not shown. Free-trial users cannot enable pay-per-usage overage.

## Company Archives

Company members see their own recordings and contacts. Administrators can retrieve
employee recordings through `/admin/recordings`, including former employees'
archives. Removing access keeps those recordings; a timed company retention policy
can still delete them. See [small team setup](small-team-setup.md).

## Android archive

The native wrapper is archived. Upload recordings through the web app/PWA or a client using the integration API. Backend upload/sync APIs remain available; see [Android archive](android-app.md).

## Support

`/support` lets users submit a support request with:

- name
- email
- subject
- message

The request is stored in MongoDB. If support email delivery is configured, the app also sends the outbound email after the response is returned.
The route works for signed-in and signed-out visitors, but it enforces origin checks, rate limits, and a honeypot field.
