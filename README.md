# Call Memo (VoSift)

Call Memo is a Next.js 16 application for storing, transcribing, searching, and sharing recorded conversations. It combines direct audio uploads, transcript review, contact linking, semantic search, billing, admin controls, push notifications, and an Android wrapper in a single product.

## What The App Does

- Upload recordings directly from the browser or Android device to Cloudflare R2.
- Process transcripts with Soniox or ElevenLabs.
- Generate summaries, transliterations, and embeddings with Gemini.
- Search recordings by text, semantic meaning, contact, date, and duration.
- Organize a call library with contacts, tags, starring, archiving, and retention rules.
- Share full recordings or clipped segments with signed public links.
- Manage subscriptions, usage, overage, announcements, and users from an admin surface.

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
- Capacitor Android wrapper
- Web Push + optional SMTP support

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from the variables listed in [docs/setup-guide.md](docs/setup-guide.md).

3. Initialize MongoDB collections, indexes, and seeded defaults:

```bash
npx tsx src/lib/db/init.ts
```

4. Start the app:

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
- [Changelog](CHANGELOG.md)

## Common Commands

```bash
npm run dev
npm run lint
npm run typecheck
npm run build
npm run cap:sync
```

## Operational Notes

- The web app runs on port `9000` by default.
- Uploads support files up to `5 GiB`.
- Transcription is limited to files up to `2 GiB`; larger files can still be stored and played back.
- Billing, Google Contacts sync, push notifications, SMTP support, and transcription providers are all environment-driven and can be enabled independently.
