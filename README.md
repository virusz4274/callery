# CallOrganizer

A modern web application for managing, transcribing, and organizing phone call recordings.

## Documentation

*   [**Setup Guide**](docs/setup-guide.md): Installation, environment variables, and running locally.
*   [**Architecture**](docs/architecture.md): System overview, tech stack, and diagrams.
*   [**Data Model**](docs/data-model.md): MongoDB schema and types.
*   [**Branch Reconciliation**](docs/branch-reconciliation.md): Preserved snapshots, confirmed decisions, and verification.
*   [**API Reference**](docs/api-reference.md): API endpoints documentation.
*   [**Billing & Subscriptions**](docs/billing.md): Plans, limits, and Stripe integration.
*   [**Cron Jobs**](docs/cron-jobs.md): Exports, retention, digests, and billing retries.

## Quick Start

1.  **Install dependencies**:
    ```bash
    pnpm install
    ```

2.  **Set up environment variables**:
    Copy `.env.example` (or see [Setup Guide](docs/setup-guide.md)) to `.env`.

3.  **Initialize the Database**:
    ```bash
    pnpm run db:init
    ```

4.  **Run the development server**:
    ```bash
    pnpm run dev
    ```

Open [http://localhost:9000](http://localhost:9000) with your browser to see the result.

## Deployment Profiles

One codebase supports self-host and managed deployments (see `.env.example`).
Set the profile before building: Next.js compiles `NEXT_PUBLIC_*` settings into
the browser bundle, so changing auth, billing, or other public settings requires
`docker compose up --build`.

| | Self-host | Managed (SaaS) |
|---|---|---|
| Auth (`AUTH_PROVIDER`) | `local` (built-in email/password) or `firebase` | `firebase` |
| Billing | Off (`NEXT_PUBLIC_ENABLE_BILLING=false`) | On (Stripe) |
| Email (`EMAIL_PROVIDER`) | `smtp` / `resend` / `none` | `resend` |
| Transcription | Soniox / ElevenLabs / Gemini or a compatible local server | Same, metered with multipliers |
| Storage | Any S3-compatible (MinIO, R2, AWS) | Same |
| Database | Your MongoDB (compose includes one) | Same |

Self-host quickstart:

```bash
cp .env.selfhost.example .env
# Set BETTER_AUTH_SECRET, CRON_SECRET, storage credentials, and an optional transcription backend.
docker compose --profile selfhost up --build -d
docker compose ps -a
```

Open [http://localhost:3000](http://localhost:3000). Compose waits for MongoDB
and initializes its indexes and plans before starting the app, and bundles
MinIO for object storage (bucket auto-created; point R2_ENDPOINT elsewhere
for R2/AWS/external MinIO). The app health check verifies the server and
database; test upload, playback, and transcription after setup.

This deployment uses Next.js standalone on Node, including the Serwist service
worker. The experimental vinext/Workers setup is separate; its compatibility
percentage does not govern the Docker deployment.

See the [Setup Guide](docs/setup-guide.md) for storage, local AI, and every variable.
