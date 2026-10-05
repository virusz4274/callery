# Android work is archived

The Capacitor wrapper, Android project and native UI are archived while a replacement client is planned. Their exact source remains on `codex/backup-2026-10-05-6dd47cef-new-works` at `c8d65599e48aba828e43fde6d839079e46f49f6f`. See [the reconciliation record](branch-reconciliation.md) for the independent bundle.

The web app/PWA and reusable backend endpoints remain active:

- `POST /api/mobile/sync-session`: exchange an authenticated cookie or bearer session for a limited sync token.
- `POST /api/mobile/direct-upload/init`: validate metadata and sign a storage upload.
- `POST /api/mobile/direct-upload/complete`: verify the object, create the recording and schedule optional transcription. Repeating completion returns the existing recording.

A future client must use its instance's login mechanism: Better Auth or Firebase. Configure the instance URL, log in, then authenticate the sync-token request. Upload and sync tokens use separate audiences/signing keys and cannot replace each other.

There are no active Capacitor build/sync scripts in this branch.
