# Callery

A web application for managing, transcribing, and organizing phone call recordings.

[![Watch the Callery product demo on YouTube](https://i.ytimg.com/vi/Z4hJoVGuXgw/maxresdefault.jpg)](https://www.youtube.com/watch?v=Z4hJoVGuXgw)

**Self-host Callery for free under [AGPL-3.0](LICENSE), or use the paid managed service.** Self-hosters operate their own database, private S3-compatible storage, email and processing providers. Managed users get individual accounts with hosting and setup handled for them. Company archives and employee invitations are self-host features; the managed launch does not offer organizations or seat billing. Managed Lifetime is retained access with the documented processing/usage limits, not unlimited provider services; see [billing](docs/billing.md).

This is beta software. The supported first release is built from source with native Node or Docker Compose. There is no universal prebuilt application image: public settings, including the deployment origin and billing mode, must be chosen before building. Read [release verification and limitations](docs/releases.md), [contributing](CONTRIBUTING.md), and [security reporting](SECURITY.md) before a public deployment.

## Documentation

*   [**Setup Guide**](docs/setup-guide.md): Installation, environment variables, and running locally.
*   [**Small Team Setup and Recovery**](docs/small-team-setup.md): Invitations, company archives, retained employee access and deployment backups.
*   [**User Guide**](docs/user-guide.md): Recording retrieval, sharing, settings, exports, and company archive behavior.
*   [**Transcription Batches**](docs/transcription-batches.md): Bulk imports, saved batches, explicit starts, and failure recovery.
*   [**Integration API**](docs/integration-api.md): Scoped client tokens, resumable uploads, downloads, and transcription requests.
*   [**AI Assistant Connections**](docs/mcp-platforms.md): MCP and OAuth setup for ChatGPT, Claude, Gemini, and compatible clients. The public `/developers` page links these guides and the instance's live OpenAPI contract.
*   [**Architecture**](docs/architecture.md): System overview, tech stack, and diagrams.
*   [**Data Model**](docs/data-model.md): MongoDB schema and types.
*   [**Historical Branch Reconciliation**](docs/branch-reconciliation.md): Archived integration evidence, superseded by the current guides.
*   [**Dependency Review**](docs/dependency-review.md): Current packages, security decisions and upgrade validation.
*   [**API Reference**](docs/api-reference.md): API endpoints documentation.
*   [**Billing & Subscriptions**](docs/billing.md): Upfront plans, prepaid usage, provider weights and Stripe integration; no runtime profit targets or provider-expense budgets.
*   [**Cron Jobs**](docs/cron-jobs.md): Exports, retention, digests, and billing retries.

## Quick Start

Start from a [tagged source release](https://github.com/virusz4274/callery/releases), or clone `https://github.com/virusz4274/callery.git` and enter its directory. Choose a reviewed release tag for a production deployment.

1.  **Install dependencies**:
    Use Node 24.22.0 (selected by `.nvmrc`) and pnpm 12.14.0 (pinned in `package.json`):
    ```bash
    corepack enable pnpm
    pnpm install --frozen-lockfile
    ```

2.  **Set up environment variables**:
    For a new installation, copy `.env.example` to `.env`; preserve an existing
    deployment's file. This is the shared configuration template for native
    self-hosting, Docker Compose, and managed deployments. Follow its profile
    comments to configure MongoDB, storage, auth, and optional integrations.
    Advanced billing and upload settings are documented in the
    [billing](docs/billing.md) and [integration](docs/integration-api.md) guides.

3.  **Initialize the Database**:
    ```bash
    pnpm run db:init
    ```

4.  **Run the development server**:
    ```bash
    pnpm run dev
    ```

Open [http://localhost:9000](http://localhost:9000) with your browser to see the result.
If the deployment uses a public origin or tunnel, open the saved
`NEXT_PUBLIC_APP_URL` instead; preserve that origin when the server listens locally.

## Deployment Profiles

One codebase supports self-host and managed deployments (see `.env.example`).
Set the profile before building: Next.js compiles `NEXT_PUBLIC_*` settings into
the browser bundle, so changing billing or other public settings requires
`pnpm run build` for native deployments or `docker compose up --build` for Docker.

| | Self-host | Managed (SaaS) |
|---|---|---|
| Auth | Better Auth + MongoDB (email/password and optional Google) | Same |
| Billing | Off (`NEXT_PUBLIC_ENABLE_BILLING=false`) | On (Stripe) |
| Email (`EMAIL_PROVIDER`) | `smtp` / `resend` (`none` for private testing) | `smtp` / `resend` |
| Transcription | Soniox / ElevenLabs / Gemini or a compatible local server | Approved Soniox / Gemini / ElevenLabs models, metered at 1× / 3× / 5× |
| Storage | Any S3-compatible (MinIO, R2, AWS) | Same |
| Database | Your MongoDB (compose includes one) | Same |

The optional bundled MinIO backend is built from pinned upstream source because the community project is archived and official community images are no longer available from the checked registries. It is provided for compatibility and isolated acceptance tests. Prefer maintained, supported external S3-compatible storage for a production service. No existing external storage configuration needs to change.

Docker self-host quickstart:

```bash
cp -n .env.example .env  # New installation only; preserve an existing .env.
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

Ports bind to loopback by default. Put an HTTPS reverse proxy or tunnel in front of the app and storage for remote use; keep `NEXT_PUBLIC_APP_URL` and `S3_PUBLIC_ENDPOINT` browser-reachable. To run a second deployment, select a unique Compose project (`-p your-name`) and available `APP_PORT`, `MINIO_API_PORT`, and `MINIO_CONSOLE_PORT` values. Containers and volumes use that project's scope. Change `APP_BIND_ADDRESS`/`STORAGE_BIND_ADDRESS` only when deliberately exposing ports on another interface. Configure SMTP or Resend before opening signup to other people; managed hosting rejects email-disabled configuration.

This deployment uses Next.js standalone on Node, including the Serwist service
worker. The experimental vinext/Workers setup is separate; its compatibility
percentage does not govern the Docker deployment.

See the [Setup Guide](docs/setup-guide.md) for storage, local AI, and deployment configuration.
For semantic search, follow [Search setup](docs/setup-guide.md#search-setup):
`db:init` prints the Search index definitions but does not create them.
The bundled MongoDB service supports ordinary keyword search; vector search
needs a search-enabled deployment and the `recordings_vector_search` index.
