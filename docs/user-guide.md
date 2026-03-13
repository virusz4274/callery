# User Guide

This guide explains the current day-to-day workflow for Call Memo users.

The main purpose of the app is to turn a messy collection of call recordings into a searchable archive. Instead of leaving recordings scattered across phone storage, copied folders, or old backups, users can keep the original audio, transcript, summary, timestamps, and search context together in one place.

## Sign In And Access

- Users can sign in with email/password.
- Google sign-in is available when Firebase Google auth is enabled.
- Apple sign-in is present in the UI as a future option but is not active yet.
- After login, the main workspace is centered around `Recordings`, `Contacts`, `Files`, `Upload`, `Settings`, and `Support`.

## Uploading Recordings

1. Open `/upload`.
2. Add one or more audio files to the queue.
3. Review duplicates and queue status.
4. Start the upload.

What happens next:

- File bytes go directly from the client to Cloudflare R2.
- The app finalizes the upload, creates the recording record, and can trigger auto-transcription.
- Files stay visible in the queue with success or failure state, so retries do not require rebuilding the whole batch.
- The goal is to make imports safe and repeatable, especially when users are moving old recordings out of phones or copied backup folders.

Limits:

- Upload limit: `5 GiB` per file
- Transcription limit: `2 GiB` per file

Files over the transcription limit still upload and remain available for playback.

## Working With Recordings

From `/recordings`, users can:

- Search by text query
- Run semantic search
- Filter by date and contact
- Sort by date or duration
- Save personal views in local storage
- Use built-in smart collections like recent uploads or items that still need transcription

This is the main retrieval workflow in the product. Instead of scrolling through file names or listening to old calls one by one, users can search and narrow the archive until they reach the right recording.

Opening a recording shows:

- Secure playback
- The original recording kept as the source file
- Transcript and speaker segments when available
- Summary output
- Status for transcription processing
- Share controls

Users can also:

- Star recordings
- Archive recordings
- Tag recordings
- Manually trigger transcription on a recording

## Sharing

The share flow supports:

- Full recording links
- Optional clipped segments
- Expiration windows of `1 hour`, `24 hours`, or `7 days`

Shared links open under `/s/[token]` and do not require the recipient to log in.

## Contacts

The contacts workspace helps tie recordings back to people and companies.

Users can:

- Sync Google Contacts from Settings -> Data
- Search the directory
- Open a contact detail view
- Jump directly into recordings linked to that contact

Contact detail pages show:

- Identity details
- Company and role
- Recent call timeline
- Aggregated duration and tags

## Files

The file browser at `/files` is a storage-oriented view of the library.

Users can:

- Browse folders and files
- Inspect recording details from the file view
- Delete files intentionally through the file browser workflow

Use this when you want to reason about storage layout rather than search the main recordings table.

This is especially useful when users imported large historical archives and want to understand how recordings are organized after upload.

## Settings

The settings area includes these tabs:

- `Overview`: workspace stats and quick actions
- `Profile`: name, email-linked identity, and password changes
- `General`: timezone and general preferences
- `Data`: Google sync, transcription defaults, retention policy, and exports
- `Notifications`: digest and ingest-related notification preferences
- `Billing`: subscription, usage, overage toggle, checkout, portal, and invoice history

Notable data settings:

- Auto-transcription on upload
- Default transcription provider
- Deletion policy: `never`, `3m`, `6m`, or `1y`
- Export jobs with downloadable archive parts and an offline viewer

Exports are designed to stay usable outside the app. Instead of producing a flat unsorted dump, the export flow organizes recordings, transcripts, and metadata, and includes a viewer so users can browse history more easily offline.

## Notifications

The notification center surfaces:

- Upload and transcription outcomes
- Export completion
- Billing-related notices
- Announcements

If web push is configured, users can also opt into browser push notifications.

## Billing

When billing is enabled, users can:

- Review their current plan
- See storage and transcription usage
- Enable or disable overage
- Upgrade through Stripe Checkout
- Open the Stripe customer portal
- Review recent invoices

If billing is disabled through environment config, the billing tab is hidden.

## Private Hosting

Some users may want to keep the application on their own server for stronger control over storage and data ownership.

- Individuals can purchase a self-hosted license for private deployment.
- Teams can use private hosting arrangements when needed.
- The hosted app and private deployments follow the same core workflow: archive recordings, generate transcript context, and make the library searchable.

## Support

The support page provides:

- A support message form backed by `/api/support`
- Quick links to pricing and changelog pages
- A direct email support action

Support requests are stored by the app and can also be forwarded by email when SMTP is configured.
