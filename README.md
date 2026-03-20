# Call Memo (VoSift)

Call Memo is a Next.js 16 application for turning scattered call recordings into a searchable archive. The app keeps the original audio, transcript, summary, speaker labels, timestamps, and search context together so users can find important conversations again without digging through folders.

## Current Product Scope

- Direct browser uploads to Cloudflare R2 with signed upload sessions.
- Capacitor Android wrapper with a folder-sync workflow under `/android-sync` that loads the hosted app remotely.
- Soniox and ElevenLabs transcription, with Gemini-based summaries, transliteration, and embeddings.
- Recordings, contacts, files, exports, signed share links, notifications, support intake, and admin tooling.
- Optional Stripe billing, Google Contacts sync, browser push, and SMTP-backed support email delivery.

## Stack

- Next.js 16 App Router
- React 19
- Tailwind CSS v4
- HeroUI v3 beta
- MongoDB
- Firebase Auth + Firebase Admin
- Cloudflare R2
- Stripe
- Gemini, Soniox, ElevenLabs
- Capacitor Android
- Web Push + optional SMTP support

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Copy the tracked environment template:

```bash
cp .env.example .env
```

3. Fill in the values described in [docs/setup-guide.md](docs/setup-guide.md).

4. Initialize MongoDB collections, indexes, plans, and default system settings:

```bash
npx tsx src/lib/db/init.ts
```

5. Start the app:

```bash
npm run dev
```

Local URL: [http://localhost:9000](http://localhost:9000)

## Documentation

- [Documentation Index](docs/README.md)
- [Setup Guide](docs/setup-guide.md)
- [User Guide](docs/user-guide.md)
- [Admin Guide](docs/admin-guide.md)
- [Architecture](docs/architecture.md)
- [API Reference](docs/api-reference.md)
- [Data Model](docs/data-model.md)
- [Billing](docs/billing.md)
- [Android App](docs/android-app.md)
- [Full Application Test Plan](docs/full-application-test-plan.md)
- [Stripe Billing Verification](docs/stripe-billing-verification.md)
- [Dependency Review Register](docs/dependency-review.md)
- [Changelog](CHANGELOG.md)

## Common Commands

```bash
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npm run cap:sync
```

## Operational Notes

- The web app runs on port `9000` by default.
- The build uses Next.js standalone output.
- Server Actions are configured with a `20mb` body limit, while large media uploads bypass the app server through direct R2 `PUT` uploads.
- Supported upload formats are `mp3`, `wav`, `m4a`, `mp4`, and `webm`.
- Upload limit is `5 GiB` per file.
- Transcription limit is `2 GiB` per file, and longer recordings may be processed asynchronously by the provider.
- Recordings longer than `5 minutes` are handed off to Soniox or ElevenLabs async flows plus webhooks; shorter jobs can finish inline.
- Billing routes return `403` when `NEXT_PUBLIC_ENABLE_BILLING=false`.
- Cron routes require `Authorization: Bearer <CRON_SECRET>`.
