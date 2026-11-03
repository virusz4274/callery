# Android work is archived

The Capacitor wrapper, Android project and native UI are archived. Their historical
source was preserved at commit `c8d65599e48aba828e43fde6d839079e46f49f6f` under the
backup branch `codex/backup-2026-10-05-6dd47cef-new-works`. That branch and the
machine-local bundle may not exist in another checkout; see
[the reconciliation record](branch-reconciliation.md) for the original recovery
references. There is no maintained native client or replacement release in this branch.

The web app/PWA and reusable backend endpoints remain active:

- `POST /api/mobile/sync-session`: exchange a Better Auth cookie or bearer session for a limited 24-hour sync token.
- `POST /api/mobile/direct-upload/init`: validate metadata and return an upload URL/token and required headers; direct-storage uploads and bounded app-streaming uploads share this contract.
- `POST /api/mobile/direct-upload/complete`: verify the object, create the recording and schedule optional transcription. Repeating completion returns the existing recording.

These mobile upload endpoints accept either the sync token or the instance's
Better Auth session. Configure the instance URL, log in, then authenticate the
sync-token request. Upload and sync tokens use separate audiences/signing keys
and cannot replace each other. Access removal rejects old tokens even after
access is restored.

For a new sync client or CRM integration, use the versioned
[`/api/v1` integration API](integration-api.md) with a named scoped token created
in **Settings → Integrations**. It supports resumable uploads, polling, downloads,
and explicit transcription without requiring a client to manage browser sessions.

There are no active Capacitor build/sync scripts in this branch.
