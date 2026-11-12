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

### Prepare the original recording files

For the organized bulk archive, use a supported dialer that saves original call
recordings in storage visible to your phone’s file manager. Copy the files
together without renaming them and keep a separate backup. On supported Samsung
Phone setups, start at **My Files → Internal storage → Recordings → Call**.
Xiaomi, OnePlus, OPPO, realme, and vivo/iQOO OEM options depend on the exact
model, firmware, region, file access, and filename layout; a recording button
alone is insufficient. The same brand can require different dialer methods.

Google Phone’s individual Share workflow is unsupported for this archive.
Callery cannot read private dialer storage, import the dialer’s private call log,
or reconstruct caller/date details missing from shared filenames. Switching to
a supported OEM dialer affects future recordings; it does not migrate old ones.
Check the [phone compatibility guide](https://getcallery.com/phone-compatibility)
and try a few original files before importing a whole collection. Each device
guide includes copyable instructions for ChatGPT, Gemini, Claude, or Codex and the
[AI setup limits](https://getcallery.com/guides/set-up-call-recording-with-ai): no
root, external APKs, or firmware changes; stop an attempted route when its required
OEM apps are missing or restoration fails. Research another route only when the
matching guide permits it and its evidence applies to the device. The dialer
writes originals into shared storage, the file
manager uses normal permissions to copy them, and Callery's browser file picker
reads the selected files without unrestricted phone-storage write access.

Automatic caller and date recognition depends on the original filename; see the
[recognized layouts](recording-filenames.md). An unfamiliar supported audio file
can still upload, but its unknown caller and upload time do not provide the
intended contact-and-date archive.

### Transfer and resume uploads

Uploads use a resumable session lasting 24 hours. The queue shows byte progress,
expiry and per-file status. Pause keeps completed parts; cancel discards the
unfinished upload. Two files can transfer concurrently, with four part transfers
across the queue. Uploads continue while navigating inside the app.

After a reload or browser restart, choose **Select original file** to continue.
The browser stores session metadata and part fingerprints, not another copy of
your audio. Completed parts are checked against the selected file before reuse.
Offline uploads wait for connectivity; uncertain completion retries the same
session rather than transferring the file again. Closing the browser stops
transfers until it is reopened.

Bytes travel directly to storage when the bucket supports verified multipart
uploads, or through bounded part requests to the app. Finalization validates the
object, creates one recording and optionally queues auto-transcription. Bulk
imports retain their processing hold through retries.

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

In **AI search**, **Index saved transcripts** makes older transcripts searchable
by meaning without transcribing their audio again. Contact/date filters apply.
Each confirmed request queues up to 100 recordings; use the queue status and
repeat for the remaining library. Indexing uses the configured embedding provider,
so provider charges may apply. Saved embedding responses are reused on retry;
uncertain provider outcomes require administrator review. This also rebuilds
indexes after an embedding-profile change.

Keyword fallback can paginate the full matching archive. Search by meaning ranks
up to 200 conversations per query; narrow the contact/date filters when needed.

Recording detail state can include:

- playback
- transcript segments with speaker labels
- summary
- transliteration output when available
- transcription provider metadata
- sharing controls

### Finding a moment in a call

In **AI search**, describe what you remember. Search covers transcript passages,
including details absent from the summary. Contact and date filters also apply.
Results show matching excerpts; open one to jump to its transcript segment and
its audio time when timing is available. Search coverage indicates recordings
still indexing or needing processing attention. A deployment without a ready
vector index displays explicitly labelled keyword matches instead.

Within a recording, click a timestamp to seek and follow the highlighted current
segment. **Find in transcript** supports previous/next matches in the displayed
original or transliterated script. Playback position is remembered per signed-in
account and recording; an explicit search result takes precedence. Public-share
recipient positions are not saved. Transcripts remain read-only and display every
speaker returned by the model as Speaker 1, Speaker 2 and so on. Missing timing
is shown as unavailable.

Use **Copy transcript** or **Download TXT** to take a single transcript out of the
viewer. Both include all loaded segments with speaker labels and available
timestamps, even when Find highlights only a few matches. They follow the selected
Original or Transliteration script, falling back to original text where a segment
has no transliteration. No new processing or archive export job is started.

## Transcription Workspace

Open **Transcription → Bulk import** to upload recordings without starting provider
processing. On `/transcription`, select waiting recordings to start a batch or save
it for later. Saved batches can be started, paused, and resumed explicitly; finishing
one does not start another saved draft. Other batches already started remain
eligible for processing. See [transcription batches](transcription-batches.md)
for processing limits, saved-transcript recovery, and uncertain provider outcomes.

## Sharing

Share the complete recording, including its audio, transcript, transliteration
and summary when available. Recipients do not need an account.

Each link has an expiry: choose one hour, 24 hours (the default), seven days or a
custom future date/time. Open **Share** to copy existing links, review their
status and revoke them individually. Expiry and revocation deny subsequent page
and audio requests; content already received or buffered cannot be withdrawn.

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
- `Notifications`: activity digest and browser notification preferences
- `Billing`: plan, usage, invoices, portal, and checkout when billing is enabled

Notable settings behavior:

- deletion policy values are `never`, `3m`, `6m`, and `1y`
- export jobs create downloadable archive parts and an offline viewer
- billing is hidden unless `NEXT_PUBLIC_ENABLE_BILLING=true`
- billing controls appear under the `Billing & Plans` panel title when enabled

In a company archive, **Processing** and **Retention** show the administrator's
policy instead of personal editing controls. **Integrations** creates scoped API
tokens for clients, displays each new secret once, and lets you rotate or revoke
tokens separately. Connected OAuth apps are listed with their permissions and
can be disconnected independently. AI search results link back to Callery for
playback; opening a link still requires an authorized Callery session. The public
`/developers` page links [integration setup](integration-api.md), the live OpenAPI
reference, and [AI assistant connection instructions](mcp-platforms.md).

### Closing a personal account

Use **Profile → Delete account** to permanently close a personal account. Export
your archive first if you want to keep a copy. Confirmation requires typing your
email address and a login from the last ten minutes; an older login requires
signing in again and repeating confirmation. The last active administrator must
make another user an administrator before closing their account.

Accepted closure removes access immediately and signs you out. If storage or
active processing delays deletion, the confirmation page explains that cleanup
will continue automatically. Existing charges and billing settlement still apply.
Company accounts instead show guidance to contact an administrator, who can
remove access while retaining the company archive.

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

The center initially loads the newest 20 notifications. **Load older notifications**
opens more history; the unread badge counts all unread notifications, including
those not loaded yet. **Mark all read** and **Clear list** apply to the whole
notification history.

Recording activity emails are limited to optional weekly or monthly activity digests;
individual uploads and transcriptions do not send processing emails. New accounts
start with weekly digests, which can be disabled in Settings.
Monthly digests cover the previous UTC calendar month. Weekly digests cover the
seven days ending at the scheduled run time; future-dated recordings are excluded.

If VAPID keys are configured, users can also register browser push notifications.
Expired browser subscriptions are removed after a permanent provider response;
temporary delivery errors keep the subscription for future notifications.
Administrator announcements appear separately as workspace notices.

## Billing

When billing is enabled, users can:

- review the active plan
- see storage and transcription usage
- enable or disable overage on an eligible recurring plan
- start Stripe Checkout
- open the Stripe customer portal
- review invoice history

If billing is disabled for the deployment, these controls are not shown. Free-trial users cannot enable pay-per-usage overage. Lifetime owners manage or cancel their separately billed usage through the customer portal; they do not have the recurring-plan overage switch.

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
