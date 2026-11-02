# Changelog

All notable changes to this project are documented here.

## [Unreleased]

### Added

- Added **Retry export** for eligible storage failures, resuming verified archive parts within the original export window and single-retry limit.
- Linked the final product video from the README; video production files remain outside the repository.

### Fixed

- Prevented competing or stale export workers from publishing checkpoints, and coordinated archive expiry and object cleanup with active generation.
- Bounded archive transfers and preserved completed exports when notification delivery fails, with safe failure details and clearer retry feedback.

### Changed

- Updated setup, architecture, API, data model, user and admin guides to match current processing, export and health-check behavior.
- Removed obsolete dependency patches and URL-parser aliases; dependency audits now fail on every reported advisory without exceptions.
- Retired unused assets, configuration and ad-hoc data/debug scripts while retaining the supported application assets and operational checks.
- Removed repo-stored audit report documents in favor of code-derived operational docs.

## [v0.1.0] - 2026-02-02 (Beta)

### Added

- Core recording archive with R2-backed uploads and playback
- Soniox and ElevenLabs transcription support
- Gemini summaries, transliteration, and semantic-search embeddings
- Google Contacts sync and contact-linked archive navigation
- Stripe billing with plans and metered usage
- Admin dashboard with user, plan, announcement, and settings management
