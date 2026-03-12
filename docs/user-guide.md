# User Guide

This guide explains day-to-day usage of Call Memo.

## Getting Started

- Sign in with your configured authentication method.
- On first login, your profile is created automatically.
- Main areas: `Recordings`, `Upload`, `Contacts`, `Settings`.

## Recording Workflow

1. Upload audio files from the Upload page.
2. Files upload directly from your device to Cloudflare R2 and are then indexed.
3. Transcription runs with your selected provider when the file is within provider limits.
4. Summaries/search embeddings are generated when AI is configured.

Upload and transcription limits:

- Upload supports files up to 5 GiB.
- Transcription supports files up to 2 GiB.
- Files larger than 2 GiB can still be uploaded and played, but transcription is blocked/skipped.

## Working with Recordings

- Open a recording to view audio, transcript, and summary.
- Star, tag, archive, or delete recordings.
- Use filters (date/contact/duration/tags) to narrow results.
- Use semantic search to find concept-level matches.

## Contacts

- Connect Google Contacts from Settings Data section.
- Sync imports contacts and links known phone numbers.
- You can manually assign contacts to recordings.

## Sharing

- Create signed share links for individual recordings.
- Choose expiration window before generating link.
- Shared pages are read-only and do not require recipient login.

## Billing and Usage

- View plan, quota usage, and subscription status in Settings.
- Enable/disable Pay Per Usage (overage) when available.
- Manage plan changes in the Stripe customer portal.

## Data and Retention

- Configure automatic deletion policy (`never`, `3m`, `6m`, `1y`).
- Request data exports from settings; completed exports arrive via in-app notification/email.
- Export links are time-limited and intended for download soon after generation.
