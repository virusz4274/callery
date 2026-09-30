# CallOrganizer

A modern web application for managing, transcribing, and organizing phone call recordings.

## Documentation

*   [**Setup Guide**](docs/setup-guide.md): Installation, environment variables, and running locally.
*   [**Architecture**](docs/architecture.md): System overview, tech stack, and diagrams.
*   [**Data Model**](docs/data-model.md): MongoDB schema and types.
*   [**Project Structure**](docs/project-structure.md): Codebase organization and key files.
*   [**API Reference**](docs/api-reference.md): API endpoints documentation.
*   [**Billing & Subscriptions**](docs/billing.md): Plans, limits, and Stripe integration.
*   [**Launch Checklist**](docs/launch-checklist.md): Pre-launch steps and owed verifications.

## Quick Start

1.  **Install dependencies**:
    ```bash
    pnpm install
    ```

2.  **Set up environment variables**:
    Copy `.env.example` (or see [Setup Guide](docs/setup-guide.md)) to `.env`.

3.  **Initialize the Database**:
    ```bash
    pnpm dlx tsx src/lib/db/init.ts
    ```

4.  **Run the development server**:
    ```bash
    pnpm run dev
    ```

Open [http://localhost:9000](http://localhost:9000) with your browser to see the result.

## Deployment Profiles

One image, two personalities, switched purely by env (see `.env.example`):

| | Self-host | Managed (SaaS) |
|---|---|---|
| Auth (`AUTH_PROVIDER`) | `local` (built-in email/password) or `firebase` | `firebase` |
| Billing | Off (`NEXT_PUBLIC_ENABLE_BILLING=false`) | On (Stripe) |
| Email (`EMAIL_PROVIDER`) | `smtp` / `resend` / `none` | `resend` |
| Transcription | Your Soniox / ElevenLabs / Gemini key | Same, metered with multipliers |
| Storage | Any S3-compatible (MinIO, R2, AWS) | Same |
| Database | Your MongoDB (compose includes one) | Same |

Self-host quickstart:

```bash
cp .env.example .env   # fill in Mongo, S3, one transcription key
docker compose --profile selfhost up
```

See the [Setup Guide](docs/setup-guide.md) for every variable.
