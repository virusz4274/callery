Yes. The core is fairly complete—uploads, durable transcription jobs, batches, search, exports, billing, company archives, and API tokens already exist. **The biggest opportunity is finishing the workflows around those features.**

I scanned the UI, server actions, API routes, data models, background jobs, tests, and documentation.

**These are the clearest disconnects to fix first:**

| Gap | What I found | Recommended change |
|---|---|---|
| **Completed: cleanup tracking** | Orphan cleanup previously removed database records even when storage deletion failed. [Implementation](/home/virusz4274/development/callery/src/app/actions/admin/recordings.ts:97) | Failed deletions now retain their exact storage references for retry. Cleanup deduplicates keys, limits concurrency, and reports complete, partial, and failed outcomes accurately. |
| **Completed: digest-only email settings** | Unused processing success/failure email controls and their sender have been removed. [Implementation](/home/virusz4274/development/callery/src/components/settings/notifications-settings.tsx:14) | Email preferences are Off/Weekly/Monthly digests, with weekly as the signup default. Individual uploads and transcriptions do not send processing emails; existing in-app and browser notifications remain. |
| **Completed: transcription refresh** | Queued and running recordings now refresh until completion or a result requiring explicit recovery. [Implementation](/home/virusz4274/development/callery/src/lib/recording-refresh.ts) | Removed the 90-second cutoff. Timeout/interruption recovery now saves terminal processing status and update time even after the queue marker is cleared, stopping polling and permitting reviewed recovery. Attempt/revision guards preserve newer work. |
| **Saved views cross account boundaries** | View names, search terms, and filters use one browser-wide storage key. Another account using that browser can inherit them. [Code](/home/virusz4274/development/callery/src/components/pages/recordings-page.tsx:23) | Scope preferences by account; eventually sync them across devices. |
| **Completed: personal-account closure** | Permanent account closure is available under Settings → Profile → Delete account. [Implementation](/home/virusz4274/development/callery/src/components/settings/account-closure-settings.tsx:17) | Typed-email confirmation and a login within ten minutes are required. Company and last-administrator protections apply; accepted requests sign out and show a completed or pending-cleanup receipt. Failed cleanup retains references for automatic retry. |

Initial completion verification for cleanup tracking, digest-only email settings and personal-account closure (2026-11-08): typecheck, lint, 918 automated tests, and 18 isolated desktop/mobile browser tests passed. Another 31 service-dependent integration tests were skipped because isolated services were not configured; full integration verification remains incomplete. These three fixes required no migrations.

**Product feature status:**

| Feature | Current gap | What I would build |
|---|---|---|
| **Recording organization** | Tags, stars, and archive flags exist in the model and mutation API, but have no editing controls. [Action](/home/virusz4274/development/callery/src/app/actions/recordings.ts:86) | Tag editing/filtering, Starred and Archived views, archive/unarchive, and bulk organization. |
| **Correct recording details** | Browser uploads infer caller/date from filenames. Missing dates become upload time; users cannot correct the date or phone afterward. [Upload logic](/home/virusz4274/development/callery/src/app/actions/upload/prepare-upload-context.ts:51) | Upload review and an “Edit recording details” dialog, including contact reassignment. |
| **Intentional: read-only transcripts** | Transcripts remain read-only with generic Speaker 1, Speaker 2, etc., as requested. [Viewer](/home/virusz4274/development/callery/src/components/recording-view/recording-content.tsx) | Display every speaker returned by the model. Transcript editing, speaker renaming and filename-based conference-call detection are outside the agreed scope. |
| **Completed: audio-linked transcript navigation** | Timestamps seek within the audio and the current segment is highlighted. [Implementation](/home/virusz4274/development/callery/src/components/recording-view/recording-content.tsx) | Original/transliterated find, account-scoped playback history and timed search excerpts are available. Background signed-URL refresh preserves playback position and playing/paused state; passage targets apply once per media/target identity. Account changes and unmount still pause old audio. |
| **Completed: resilient browser uploads** | Browser uploads now use durable multipart sessions with direct and bounded-proxy transports. [Implementation](/home/virusz4274/development/callery/src/lib/browser-upload-manager.ts) | Added byte progress, bounded concurrency, pause/resume/cancel, offline recovery and retained session metadata. After reload, users reselect the original file to resume verified parts. Finalization retries reuse the same session. |
| **Library-wide duplicate detection** | Browser duplicate checks compare only against the currently open queue. [Code](/home/virusz4274/development/callery/src/components/pages/upload/use-upload-queue.ts:51) | Durable source/content identity, an “already imported” link, and an explicit override. |
| **Completed: deeper, scoped AI search** | Semantic retrieval uses transcript passages, scoped hybrid ranking and timed excerpts. [Implementation](/home/virusz4274/development/callery/src/lib/search/retrieval.ts) | AI search now provides confirmed batches of up to 100 saved transcripts for embedding-only indexing/profile rebuilds, using the shared durable dispatcher. Audio, summaries and original usage receipts are preserved. Known retries reuse saved responses; uncertain calls require review. Keyword fallback paginates beyond 200; the bounded 200-conversation semantic window is disclosed. Readiness verifies dimensions, cosine similarity and scope filters. |
| **Completed: share management** | Full-recording links have mandatory expiry, a management list and individual revocation. [Implementation](/home/virusz4274/development/callery/src/components/sharing/share-popover.tsx) | Added expiry presets/custom dates, copy/revoke controls and live access checks for shared pages and streamed audio. Clip sharing was removed as requested. |
| **Retention preview and recovery** | Retention permanently deletes audio without an affected-recordings preview, recording trash, or preservation exception. [Cleanup](/home/virusz4274/development/callery/src/app/api/cron/cleanup-recordings/route.ts:48) | Preview counts/bytes, confirm policy changes, and add a grace period or “keep this recording” control. |

Completion verification for sharing, semantic search, resumable uploads and transcript navigation (2026-11-08): production build/PWA checks, typecheck, lint, 960 automated tests and 16 isolated desktop/mobile browser tests passed. Another 32 service-dependent tests were skipped; live MongoDB Vector Search/S3 acceptance and live-provider relevance remain unverified. Fresh index/configuration definitions and setup documentation were added without migrations or shared `.env` changes.

Follow-up fixes verified (2026-11-08): 1,041 automated tests and 21 isolated
desktop/mobile browser tests passed, along with lint, TypeScript and an isolated
production/PWA build. The 32 service-dependent tests remain skipped. Regression
coverage includes timeout recovery after queue-marker removal, runtime repair of
existing stuck records, stale-attempt fencing, audio continuity during URL
rotation, saved-transcript backfill, profile changes and reversions, bounded
indexing continuation, durable response reuse, account isolation and keyword
pagination beyond 200. The next ingestion worker run repairs old stuck statuses;
no migration, live reindexing, shared environment change or server restart was run.

**There are also operational gaps that will become more noticeable as usage grows:**

- **Scheduler visibility:** Admin health checks services, but does not show last successful cron runs, queue age, or overdue work. Add a job-status dashboard and stalled-work alerts. [Health checks](/home/virusz4274/development/callery/src/app/actions/admin-health.ts:41)
- **Retention backlog:** Cleanup processes only 100 expired recordings per user per invocation. Under the supplied daily schedule, 10,000 expired recordings could take roughly 100 days to drain. [Selection](/home/virusz4274/development/callery/src/lib/db/recordings/retention.ts:53)
- **Reliable email delivery:** Digests lack period-based deduplication and catch-up; managed support email gets one background attempt without a retry worker or operator inbox. [Digest](/home/virusz4274/development/callery/src/app/api/cron/digest/route.ts:41), [support](/home/virusz4274/development/callery/src/app/api/support/route.ts:109)
- **Completed: bounded notification history:** Notifications load in pages of 20 with an accurate unread count across all history and a **Load older notifications** control. Polling preserves loaded history without duplicate rows or historical-arrival alerts; read/clear actions cover unloaded pages. Batch grouping remains a possible later enhancement. [Query](/home/virusz4274/development/callery/src/lib/notifications.ts)
- **Account security and access history:** No MFA/passkey enrollment or active-device management UI. Company archive reads and audio/export URL issuance also need audit events. [Auth configuration](/home/virusz4274/development/callery/src/lib/auth/server.ts:76)

For subsequent feature development, the strongest candidates are:

- **Structured follow-ups:** Turn summary action items into tasks with owners, dates, and completion status.
- **Contact resolution:** Manual contacts, CSV/vCard imports, and a workspace for unmatched or incorrectly matched calls.
- **Focused exports:** Per-call **Copy transcript** and **Download TXT** are completed; SRT/VTT exports remain a possible later enhancement. [Implementation](/home/virusz4274/development/callery/src/components/recording-view/transcript-export-actions.tsx)
- **Useful analytics:** Call trends, contact activity, processing failures, and usage history.
- **Automation events:** Signed outbound webhooks for transcription completion/failure; the current integration API requires polling.

I would sequence the work as **disconnect fixes → recording organization and correction → playback/upload improvements → deeper search and follow-ups**. Those changes directly improve everyday use. Departments, elaborate roles, SSO/SCIM, and seat billing can wait for demonstrated demand; the current single-company scope is deliberate.

The original source review was read-only. Subsequent implementation status and verification results are recorded above.

**Completed quick fixes (2026-11-11):**

- **Monthly digest date boundaries:** Totals and top contacts use the same owner-scoped reporting interval, including its start and excluding its end. Monthly digests cover exactly the previous UTC calendar month; weekly digests exclude recordings at or after their captured run time. [Implementation](/home/virusz4274/development/callery/src/lib/email/notifications.ts)
- **Expired push subscription cleanup:** Provider `404`/`410` responses remove only the failed endpoint and credential generation. Temporary errors retain subscriptions, and a delayed failure cannot remove refreshed credentials. [Implementation](/home/virusz4274/development/callery/src/lib/push-delivery.ts)
- **Atomic notification-device updates:** Registering or removing one device no longer overwrites another device's concurrent changes. Writes also recheck current account access. [Implementation](/home/virusz4274/development/callery/src/lib/push-subscriptions.ts)
- **Notification pagination:** Bounded history pages, accurate global unread counts, older-history loading, account isolation and retryable errors are completed. [Implementation](/home/virusz4274/development/callery/src/components/notifications/notification-center.tsx)
- **Single-transcript copy/TXT download:** Both actions use the full loaded transcript and the selected original/transliterated script, including speaker labels and available timestamps. Search highlighting does not limit exported text. No provider call or archive job is started. [Implementation](/home/virusz4274/development/callery/src/components/recording-view/transcript-export-actions.tsx)

Saved-view isolation was explicitly excluded from this batch and remains open.

Verification for this batch: typecheck, lint, 1,074 automated tests and 25 isolated
desktop/mobile browser tests passed. Another 32 service-dependent integration
tests were skipped because isolated services were not configured. No migration,
shared environment change or server restart was run.
