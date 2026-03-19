# Code Audit Report - 2026-03-19

## Scope

This audit reviewed the current Call Memo / VoSift codebase for implementation gaps across:

- core product flows
- business logic correctness
- external integrations
- background processing and idempotency
- operational safety

Verification completed:

- `npm run lint` - passed
- `npm run typecheck` - passed
- `npm run build` - passed

That means the primary risks are not compile-time issues; they are behavioral and integration issues.

## Implementation Status

Addressed in the current worktree:

- clip sharing is enforced by the signed token and clipped shares no longer expose full audio URLs
- delete flows now remove storage before database records so failed storage deletes remain retryable
- transcription usage reporting is guarded against duplicate replay on webhook retries
- contact merge and aggregate logic now preserves phone numbers and recalculates stats safely
- Google Contacts sync now stores durable connection/sync state and the dead `g_code` completion path has been removed

## Highest-Priority Findings

### P1 - Shared clip links do not actually restrict access to the clip

Severity: Critical

Evidence:

- [`src/app/actions/sharing.ts`](/Users/virusz4274/development/call-memo/src/app/actions/sharing.ts) only signs `recordingId`; clip bounds are appended as plain query params.
- [`src/app/s/[token]/page.tsx`](/Users/virusz4274/development/call-memo/src/app/s/[token]/page.tsx) generates a full signed R2 object URL for the entire recording.
- [`src/components/recording-view/recording-content.tsx`](/Users/virusz4274/development/call-memo/src/components/recording-view/recording-content.tsx) applies clip limits only in the browser by setting `currentTime`, pausing playback, and filtering transcript display.

Why this matters:

- Anyone with a "clip" share link can remove `clipStart` / `clipEnd` from the URL and immediately see the full transcript.
- The page exposes a full-object signed audio URL, so a recipient can fetch the whole recording outside the UI.
- This is an access-control gap, not just a UX issue.

Recommended fix:

- Include clip bounds inside the signed token.
- Enforce clip bounds server-side.
- Serve clipped media or a server-controlled streaming endpoint instead of a full-object signed URL when a clip is shared.

### P1 - Delete flows remove database records before storage objects, creating unrecoverable orphaned files

Severity: Critical

Evidence:

- [`src/app/actions/delete-recordings.ts`](/Users/virusz4274/development/call-memo/src/app/actions/delete-recordings.ts) deletes MongoDB records first, then attempts R2 deletion and still reports success when storage deletion fails.
- [`src/app/actions/recordings.ts`](/Users/virusz4274/development/call-memo/src/app/actions/recordings.ts) does the same for single-record deletion.

Why this matters:

- If R2 deletion fails, the user loses the metadata pointer while the file remains in storage.
- Those orphaned files keep consuming storage/cost and are hard to recover because the canonical DB record is already gone.
- The current response message acknowledges partial failure, but the system has already lost the information needed for a clean retry/reconciliation path.

Recommended fix:

- Reverse the order or use a tombstone/soft-delete state.
- Only hard-delete the DB record after storage deletion succeeds.
- If you must tolerate partial failure, persist a retryable cleanup job referencing the R2 key before deleting the DB record.

### P1 - Transcription webhook retries can double-count usage after late-stage failures

Severity: Critical

Evidence:

- [`src/lib/webhooks/transcription-events.ts`](/Users/virusz4274/development/call-memo/src/lib/webhooks/transcription-events.ts) allows `failed` events to be reclaimed and reprocessed.
- [`src/app/api/webhooks/soniox/route.ts`](/Users/virusz4274/development/call-memo/src/app/api/webhooks/soniox/route.ts) increments `transcriptionUsed`, reports usage, then creates a notification, and only after that marks the event processed.
- [`src/app/api/webhooks/elevenlabs/route.ts`](/Users/virusz4274/development/call-memo/src/app/api/webhooks/elevenlabs/route.ts) follows the same sequence.

Why this matters:

- If notification creation or any post-billing step fails, the webhook is marked `failed`.
- A retry will re-run the handler and increment local transcription usage again.
- Stripe meter events may be partially protected by identifiers, but local `transcriptionUsed` is not.

Recommended fix:

- Make billing side effects idempotent at the recording level, not just at the event level.
- Persist a `usageReportedAt` or equivalent per recording/provider run before noncritical work.
- Move noncritical notification work after the event is irreversibly marked processed, or make notifications separately retryable.

## Important Findings

### P2 - Contact stats become stale after deletions because `lastRecordingAt` is never recomputed on decrement

Severity: High

Evidence:

- [`src/lib/db/contacts/link.ts`](/Users/virusz4274/development/call-memo/src/lib/db/contacts/link.ts) updates `lastRecordingAt` only when `amount > 0`.
- Recording deletion paths call this decrement logic through [`src/lib/db/recordings/write.ts`](/Users/virusz4274/development/call-memo/src/lib/db/recordings/write.ts).

Why this matters:

- Deleting the most recent recording for a contact leaves `lastRecordingAt` pointing at a recording that no longer exists.
- Contact ordering, detail pages, and any relationship-centric UI built on this field become inaccurate.
- This also makes the cached aggregate model less trustworthy overall.

Recommended fix:

- Recompute contact aggregates when decrementing, or centralize contact-stat maintenance in a single recalc helper for both add/remove/link flows.

### P2 - Contact merge logic can delete a duplicate contact without preserving all phone numbers

Severity: High

Evidence:

- [`src/lib/db/contacts/write/upsert-contacts.ts`](/Users/virusz4274/development/call-memo/src/lib/db/contacts/write/upsert-contacts.ts) detects the "Google match" plus "phone match" duplicate case.
- It reassigns recordings from the phone-matched contact to the Google-matched contact and deletes the duplicate.
- It only adds `contact.phoneNumbers` from the incoming payload, not the full phone set from the deleted duplicate contact.

Why this matters:

- Any phone numbers that existed only on the deleted duplicate contact are lost.
- Future matching/linking can break because the surviving contact no longer contains the full merged identity.
- This is silent data loss during sync reconciliation.

Recommended fix:

- Merge the union of phone numbers from both contacts before deleting the duplicate.
- Consider merging other fields with precedence rules as well.

### P2 - Google Contacts sync is only a one-shot best-effort run; tokens and sync status are not persisted

Severity: High

Evidence:

- [`src/services/google/start-contacts-sync.ts`](/Users/virusz4274/development/call-memo/src/services/google/start-contacts-sync.ts) exchanges the OAuth code and immediately kicks off a background sync via `after(...)`.
- The codebase does not persist Google access tokens, refresh tokens, or a Google integration state in the user model.
- [`src/services/google/contacts-sync.ts`](/Users/virusz4274/development/call-memo/src/services/google/contacts-sync.ts) logs failures but does not persist sync status, last success, or per-run errors.

Why this matters:

- The current integration can start a sync, but it does not establish a durable connected account.
- There is no foundation for scheduled re-sync, reconnect UX, token refresh, or reliable troubleshooting.
- The UI can only say "started", not "completed", "failed", "last synced", or "needs re-auth".

Recommended fix:

- Persist Google integration state per user.
- Store refresh-token-backed credentials securely or explicitly rename the feature as one-time import.
- Record sync lifecycle state and expose it in Settings/Admin.

### P2 - Post-import migration of unknown recordings is fire-and-forget and may never finish reliably

Severity: High

Evidence:

- [`src/app/actions/save-contacts.ts`](/Users/virusz4274/development/call-memo/src/app/actions/save-contacts.ts) kicks off migration through `import(...).then(...)` with `contacts.forEach(async ...)`.
- The promises from that `forEach` are never awaited.
- The work is not wrapped in `after(...)`, a queue, or a durable job mechanism.

Why this matters:

- In serverless or request-bounded environments, this work can be dropped when the request finishes.
- Partial migration failures are easy to miss.
- Even when it does run, the lookup only starts from `contact.phoneNumbers[0]`, which is brittle for multi-number contacts.

Recommended fix:

- Move this into a real background job or `after(...)` block with awaited batching.
- Migrate by contact ID from the upsert result, not by re-looking up only the first phone number.

## Medium-Priority Findings

### P3 - Share-link generation can fall back to `localhost` in deployments where `NEXT_PUBLIC_APP_URL` is missing

Severity: Medium

Evidence:

- [`src/app/actions/sharing.ts`](/Users/virusz4274/development/call-memo/src/app/actions/sharing.ts) builds links from `process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9000'`.
- Other parts of the codebase already have a safer request-aware origin helper in [`src/lib/public-url.ts`](/Users/virusz4274/development/call-memo/src/lib/public-url.ts).

Why this matters:

- Misconfigured environments will emit broken public share links.
- This is especially risky for self-hosted or reverse-proxy deployments.

Recommended fix:

- Reuse the centralized public-origin helper everywhere share links are created.
- Fail loudly when the app cannot determine a safe public origin.

### P3 - Google sync UI still contains an unused legacy `g_code` flow

Severity: Medium

Evidence:

- [`src/hooks/settings/use-google-sync.ts`](/Users/virusz4274/development/call-memo/src/hooks/settings/use-google-sync.ts) still contains a client-side `g_code` handling path.
- [`src/app/api/auth/google/callback/route.ts`](/Users/virusz4274/development/call-memo/src/app/api/auth/google/callback/route.ts) no longer redirects with `g_code`; it now performs the exchange server-side and redirects with `google_sync=started` or `error`.

Why this matters:

- The codebase currently has two conceptual OAuth completion paths, but only one is active.
- This increases maintenance risk and makes the integration harder to reason about.

Recommended fix:

- Delete the dead `g_code` branch or reintroduce it intentionally with tests.

## Testing Gaps

The current automated coverage is not exercising the highest-risk integration paths:

- no automated coverage for Stripe webhook retries and usage idempotency
- no automated coverage for Soniox/ElevenLabs webhook retry behavior
- no automated coverage for shared-link clip enforcement
- no automated coverage for Google Contacts sync completion/failure states
- no automated coverage for partial delete failures against R2

The existing E2E suite is mostly smoke coverage around page loads, sign-in redirects, support submission, upload, and basic billing entry points.

## Suggested Remediation Order

1. Fix clip-sharing enforcement.
2. Fix delete-ordering and orphan cleanup.
3. Make transcription usage reporting idempotent across webhook retries.
4. Repair contact aggregate/merge correctness.
5. Decide whether Google sync is a durable integration or a one-time import, then implement the missing state model accordingly.
