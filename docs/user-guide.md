# User Guide

This guide reflects the current user-facing workflow in the app.

## Signing In

- Email/password sign-in is supported through Firebase.
- Google sign-in is supported when Firebase Google auth is enabled in the same Google Cloud project used by the app.
- Successful sign-in creates a Firebase session and then syncs a server-side workspace session.

Main authenticated areas:

- `/recordings`
- `/contacts`
- `/files`
- `/upload`
- `/settings`
- `/support`

On Android inside Capacitor, the sidebar also includes `/android-sync`.

## Uploading Recordings

The primary upload flow lives on `/upload`.

What happens during upload:

1. The app validates the file name, MIME type, and size.
2. The browser requests a signed R2 upload URL.
3. File bytes go directly to Cloudflare R2.
4. The app finalizes the upload, verifies the object and size, creates the recording, and optionally queues auto-transcription.

If the filename contains a recognizable contact name, phone number, or timestamp, the uploader uses that to pre-fill the recording context and storage key.

Current limits:

- maximum upload size: `5 GiB`
- maximum transcription-eligible size: `2 GiB`
- supported formats: `mp3`, `wav`, `m4a`, `mp4`, `webm`

Files larger than the transcription limit still upload and remain playable.

## Recordings Workspace

`/recordings` is the main archive view. Users can:

- browse and paginate recordings
- filter by contact, date, duration, starred state, and archive state
- search by text or semantic meaning
- save custom views locally in the browser
- apply built-in smart collections such as recent uploads, longest calls, and recordings that still need transcription
- open a recording detail view
- star, archive, and tag recordings
- request manual transcription
- generate signed share links

Recording detail state can include:

- playback
- transcript segments with speaker labels
- summary
- transliteration output when available
- transcription provider metadata
- sharing controls

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

## Contacts

`/contacts` is the relationship-focused view of the archive.

Users can:

- search contacts
- open a contact detail page
- review linked recordings for a person or company
- sync Google Contacts from Settings

Contact records track aggregate information such as total recordings and last recording date so the app can use contacts as an index into the archive. Google Contacts sync is started from Settings and then continues as a background job. The sign-in identity and the Contacts-sync consent flow are separate, even when both are configured under the same Google Cloud project.

## Files

`/files` shows a storage-oriented view derived from recording keys.

Use it when you want to:

- browse the archive like a folder tree
- inspect recordings from their storage path
- clean up intentionally through the file browser workflow

This is different from `/recordings`, which is optimized for retrieval and search. The file browser can also open a recording detail dialog or launch the single-item delete flow from the storage view.

## Settings

The current settings tabs are:

- `Profile`: name, password changes, and account details
- `General`: timezone and general workspace preferences
- `Sources`: Google Contacts connection state
- `Processing`: auto-transcription, default provider, and model settings
- `Retention`: usage review and automatic deletion policy
- `Export`: archive export jobs and downloads
- `Notifications`: digest and ingest preferences
- `Billing`: plan, usage, invoices, portal, and checkout when billing is enabled

Notable settings behavior:

- deletion policy values are `never`, `3m`, `6m`, and `1y`
- export jobs create downloadable archive parts and an offline viewer
- billing is hidden unless `NEXT_PUBLIC_ENABLE_BILLING=true`
- billing controls appear under the `Billing & Plans` panel title when enabled

## Exports

Exports are designed to stay useful outside the app.

Each export job packages:

- zipped archive parts stored in R2
- recordings grouped by contact and date
- JSON metadata
- transcript text files
- a `viewer.html` file for offline browsing

Only one pending or processing export job is allowed per user at a time.

## Notifications

The notification center can show:

- transcription completion or failure
- upload outcomes
- export completion
- billing-related notices
- announcements

If VAPID keys are configured, users can also register browser push notifications.

## Billing

When billing is enabled, users can:

- review the active plan
- see storage and transcription usage
- enable or disable overage
- start Stripe Checkout
- open the Stripe customer portal
- review invoice history

If billing is disabled for the deployment, these controls are not shown. Free-trial users cannot enable pay-per-usage overage.

## Android Sync

`/android-sync` is only functional inside the Capacitor Android app.

The flow lets users:

- choose a device folder
- scan nested files
- filter and select pending items
- upload selected recordings with the same direct-to-R2 pipeline used on the web
- run foreground or background sync, depending on the device workflow

When opened in a normal browser, the page explains that folder sync is Android-only and links users back to `/upload`.

## Support

`/support` lets users submit a support request with:

- name
- email
- subject
- message

The request is stored in MongoDB. If support email delivery is configured, the app also queues outbound email delivery in the background.
The route works for signed-in and signed-out visitors, but it enforces origin checks, rate limits, and a honeypot field.
