# CallOrganizer

A modern web application for managing, transcribing, and organizing phone call recordings.

## Documentation

*   [**Setup Guide**](docs/setup-guide.md): Installation, environment variables, and running locally.
*   [**Architecture**](docs/architecture.md): System overview, tech stack, and diagrams.
*   [**Data Model**](docs/data-model.md): MongoDB schema and types.
*   [**Branch Reconciliation**](docs/branch-reconciliation.md): Preserved snapshots, confirmed decisions, and verification.
*   [**Dependency Review**](docs/dependency-review.md): Current packages, security patches and upgrade validation.
*   [**API Reference**](docs/api-reference.md): API endpoints documentation.
*   [**Billing & Subscriptions**](docs/billing.md): Plans, limits, and Stripe integration.
*   [**Cron Jobs**](docs/cron-jobs.md): Exports, retention, digests, and billing retries.

## Quick Start

1.  **Install dependencies**:
    Use Node 24 and the pnpm version pinned in `package.json`:
    ```bash
    corepack enable pnpm
    pnpm install --frozen-lockfile
    ```

2.  **Set up environment variables**:
    Copy `.env.example` to `.env`. This is the complete template for native
    self-hosting, Docker Compose, and managed deployments. Follow its profile
    comments to configure MongoDB, storage, auth, and each optional integration.

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
the browser bundle, so changing billing or other public settings requires
`pnpm run build` for native deployments or `docker compose up --build` for Docker.

| | Self-host | Managed (SaaS) |
|---|---|---|
| Auth | Better Auth + MongoDB (email/password and optional Google) | Same |
| Billing | Off (`NEXT_PUBLIC_ENABLE_BILLING=false`) | On (Stripe) |
| Email (`EMAIL_PROVIDER`) | `smtp` / `resend` / `none` | `resend` |
| Transcription | Soniox / ElevenLabs / Gemini or a compatible local server | Same, metered with multipliers |
| Storage | Any S3-compatible (MinIO, R2, AWS) | Same |
| Database | Your MongoDB (compose includes one) | Same |

Docker self-host quickstart:

```bash
cp .env.example .env
# Apply the Docker Compose settings listed at the top of .env.example.
# Set BETTER_AUTH_SECRET, CRON_SECRET, ADMIN_EMAILS, and MinIO credentials.
# Configure every required field for any optional integration you enable.
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
