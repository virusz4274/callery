# Branch reconciliation — 2026-10-05

This integration combines committed `main`, `new-works`, and the uncommitted work on `main`. Code and behavior were compared directly; commit messages and earlier automated audit claims were not treated as proof.

## Preserved inputs

| Input | Commit |
| --- | --- |
| Original `main` | `3232f98844721502a9392f89baa2a777b510df84` |
| Original `new-works` | `c8d65599e48aba828e43fde6d839079e46f49f6f` |
| Working snapshot, including all 19 modified and 6 new files | `d106e4f63430c874928a47624c4529f3daae5df0` |

The original checkout and staging index were left untouched. Recovery branches are `codex/backup-2026-10-05-6dd47cef-main`, `codex/backup-2026-10-05-6dd47cef-new-works`, and `codex/backup-2026-10-05-6dd47cef-working-tree`.

Recovery directory: `C:\Users\virus\Documents\GitHub\Vosift-recovery-2026-10-05-6dd47cef`. It contains a Git bundle, a separately restored bare repository, the original index and patches, and 305 byte-verified working files, including ignored local configuration. Private configuration stays outside Git.

Integration branch: `codex/reconcile-branches`. Worktree: `C:\Users\virus\.codex\worktrees\reconcile-branches\Vosift`. The merge retains the working snapshot and `new-works` as parents. Neither source branch needs deletion or reset.

## Confirmed choices

| Topic | Choice |
| --- | --- |
| Hosting | One codebase for self-hosted and managed deployments |
| Auth | Local Better Auth or Firebase, selected per deployment |
| Billing | Optional; managed storage bills the period's highest stored bytes |
| Web | Keep `new-works` UI, sharing, exports, notifications, contacts and admin features |
| Android | Archive wrapper/native UI; retain upload and sync APIs for a future client |
| Launch | Docker/Node first; Cloudflare/vinext remains experimental |
| Existing customers | None; no legacy compatibility migrations |
| UI work | Preserve current web UI now; redesign separately afterward |

## Combined behavior

- Server actions, API routes and UI share the selected auth provider. Disabled/deleted profiles cannot continue using cookies or sync tokens. Local signup policy runs before identity creation, and verified bootstrap admins work with both providers.
- Configuration and external clients initialize only when needed. Billing-off local deployments build and run without Firebase or Stripe credentials.
- Upload and playback URLs are signed for the public storage host; metadata, duration reads and exports use the internal endpoint.
- The shared pipeline and UI support Soniox, ElevenLabs, Gemini and a Whisper-compatible server. User overrides or the instance default select transcription. Gemini or a compatible local server can enrich transcripts.
- Storage and peak counters update atomically. Deletion frees current capacity without lowering that period's peak. Subscription renewal starts a fresh storage baseline and transcription allowance.
- Meter events persist before delivery. Duplicate submissions coalesce, leases order peak updates, and failed deliveries retry the same identifier/value/timestamp before a newer peak is sent.
- Cleanup deletes storage before removing metadata. External failures leave disabled accounts and their object keys available for later retry.
- Keyword search and whole-day date filters work on regular MongoDB. Atlas search includes exact ownership checks; unavailable semantic search falls back to keywords.
- The Node build retains Serwist and push support. Protected APIs and signed audio bypass runtime caching.
- Native code, duplicate lockfiles, generated logs and contradictory old docs are removed from the active tree and recoverable from the saved branches/bundle.

## Verification boundaries

Checks cover TypeScript, lint, unit/regression tests, isolated real MongoDB integration tests, production builds for both auth profiles, PWA output, and a production web/API run with local auth and a local storage/provider fixture. Logs and fixture scripts are in the recovery directory.

The fixture checks request flow, ownership, retries and accounting. Real Firebase login, Stripe payments, storage signing, SMTP and cloud speech quality still need configured end-to-end checks; no external customer data or payment service was used.

The Cloudflare bundle builds, but deployment/runtime compatibility and PWA parity remain experimental. Docker Engine is unavailable on this host, so container startup has not been verified; the underlying Node app and database initialization were exercised.

Synchronous transcription uses Next.js `after(...)`; a process restart during an active job needs operational recovery. This integration does not introduce a durable transcription worker. Exports and billing delivery have persisted retry state.

## Continue safely

Continue in the integration worktree on `codex/reconcile-branches`. Keep the original dirty `main` until the result is accepted. Do not reapply its dirty patch: it is already included.

Use `git show <backup-branch>:<path>` to recover an individual removed file, or create a separate worktree from the saved `new-works` branch to revisit Android. The Git bundle restores all three inputs independently of this repository.
