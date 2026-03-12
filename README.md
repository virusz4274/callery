# Call Memo (VoSift)

Call Memo is a Next.js application for uploading, transcribing, searching, and organizing call recordings.
It uses direct browser/mobile uploads to Cloudflare R2 (up to 5 GiB per file), with a 2 GiB transcription processing limit.

## Documentation

- [Documentation Index](docs/README.md)
- [Setup Guide](docs/setup-guide.md)
- [User Guide](docs/user-guide.md)
- [Admin Guide](docs/admin-guide.md)
- [Architecture](docs/architecture.md)
- [API Reference](docs/api-reference.md)
- [Billing](docs/billing.md)
- [Changelog](CHANGELOG.md)

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Create `.env` using the required variables from [Setup Guide](docs/setup-guide.md).

3. Initialize database indexes and seed defaults:

```bash
npx tsx src/lib/db/init.ts
```

Re-run this command after pulling backend/index updates so new collections/indexes are applied.

4. Run development server:

```bash
npm run dev
```

App URL: [http://localhost:9000](http://localhost:9000)
