# Setup Guide

VoSift supports self-hosted and managed SaaS deployments from one codebase.
The Docker deployment uses Next.js standalone on Node. Set public settings
before building; `NEXT_PUBLIC_*` values are compiled into the browser bundle.
`.env.example` is the full variable reference; `.env.selfhost.example` is the
short Docker self-host template.

## Prerequisites

*   **Node.js**: v22 or later (v24 LTS recommended), with **pnpm**.
    Docker users only need Docker Engine/Desktop with Compose v2.20 or later.
*   **MongoDB**: v6.0 or later — local, Docker (compose `selfhost` profile), or Atlas.
    (Semantic search needs Atlas Search indexes; self-hosted MongoDB gets
    regex keyword search instead. See docker-compose.yml comments.)
*   **S3-compatible storage**: MinIO, Cloudflare R2, AWS S3, or similar.
*   **Transcription**: a Soniox, ElevenLabs, or Gemini key, or a local
    Whisper-compatible server (see below). Organizing and playing recordings
    do not require transcription.

Everything else is optional and degrades gracefully (details below).

## Quickstart (self-host)

```bash
cp .env.selfhost.example .env
# Set BETTER_AUTH_SECRET, CRON_SECRET, ADMIN_EMAILS, and storage credentials/endpoints.
# Configure a transcription backend if you want transcription.
docker compose --profile selfhost up   # app (port 3000) + MongoDB + MinIO
docker compose ps -a
```

Generate the auth secret with `openssl rand -base64 32`, or with Node:
`node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`.
The bundled MinIO bucket (`R2_BUCKET_NAME`) is auto-created on first start; external backends need the bucket pre-created. Compose
starts MongoDB, waits for it to be healthy, then runs the idempotent `db-init`
service to create indexes and seed missing plans. The app starts only after
initialization succeeds. `docker compose logs db-init app` shows startup errors.

Open `http://localhost:3000`, sign up with your `ADMIN_EMAILS` address, and test
upload → playback → transcription → search → delete with a sample recording.
`GET /api/health` returns 200 when the app can reach MongoDB, or 503 otherwise;
it does not verify storage credentials or transcription providers. Ordinary
keyword search has a fallback for self-hosted MongoDB. Semantic vector search
still requires a MongoDB deployment with the configured vector search index.

The app and MongoDB run locally; hosted transcription and AI providers still
receive audio/text. Choose the local Whisper + Ollama recipe below when those
operations also need to stay on your infrastructure.

Prefer local dev outside Docker? `pnpm run dev` serves on
`http://localhost:9000` (with MongoDB + storage reachable from your machine).
Use `.env.example` and run `pnpm install` then `pnpm run db:init` first.

Minimal self-host `.env` (local auth, no billing, no email):

```env
AUTH_PROVIDER=local
NEXT_PUBLIC_AUTH_PROVIDER=local
NEXT_PUBLIC_ENABLE_BILLING=false
NEXT_PUBLIC_APP_URL=http://localhost:3000
BETTER_AUTH_SECRET=<openssl rand -base64 32>
ADMIN_EMAILS=you@example.com
MONGODB_URI=mongodb://mongo:27017/vosift
R2_ENDPOINT=http://minio:9000
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=vosift
S3_REGION=us-east-1
S3_FORCE_PATH_STYLE=true
S3_PUBLIC_ENDPOINT=http://localhost:9000
TRANSCRIPTION_PROVIDER=soniox
SONIOX_API_KEY=...
AI_PROVIDER=gemini
EMAIL_PROVIDER=none
```

For access from another computer, replace both localhost URLs with the
browser-reachable app/storage addresses. Use HTTPS for a remote deployment
and PWA installation. `EMAIL_PROVIDER=none` skips email verification and cannot
send password resets; configure SMTP or Resend for those features.

When changing public settings, run the Compose command with `--build` again.
Compose derives both client and server auth settings from `AUTH_PROVIDER`,
so local accounts do not accidentally build a Firebase login screen.
Runtime secrets are excluded from the Docker build context and supplied via
`env_file`. For a direct `docker build`, pass the corresponding public settings
using `--build-arg`; the Dockerfile defaults to local auth with billing disabled.

## Deployment profiles

| Concern | Self-host | Managed (SaaS) |
|---|---|---|
| Auth (`AUTH_PROVIDER`) | `local` (built-in email/password) or `firebase` | `firebase` |
| Billing | Off by default (set nothing, or `NEXT_PUBLIC_ENABLE_BILLING=false`) | `NEXT_PUBLIC_ENABLE_BILLING=true` + Stripe keys |
| Email (`EMAIL_PROVIDER`) | `smtp` / `resend` / `none` | `resend` |
| Transcription | Your Soniox / ElevenLabs / Gemini key | Same, metered with multipliers |
| Storage | Any S3-compatible backend | Same |
| Database | Your MongoDB (compose includes one) | Same (usually Atlas) |

Auth notes:

*   `local` uses email/password with sessions in your MongoDB. First login by
    an `ADMIN_EMAILS` address bootstraps the admin role.
*   `firebase` needs the usual `NEXT_PUBLIC_FIREBASE_*` + admin credentials.
*   Both modes can additionally offer Google sign-in when the Google OAuth
    variables are set.

Billing notes:

*   Billing is **off unless** `NEXT_PUBLIC_ENABLE_BILLING=true`. When off,
    quotas don't enforce, Stripe is never called, and pricing/billing UI hides.
*   When on, `STRIPE_SECRET_KEY` (+ webhook secret for subscription sync) is required.

## Storage recipes

The app speaks plain S3 (`R2_ENDPOINT`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`) plus three knobs:

*   `S3_REGION` (default `auto` — right for R2; MinIO/AWS want `us-east-1`-style).
*   `S3_FORCE_PATH_STYLE=true` for MinIO and most S3 clones
    (`http://host:9000/bucket/key`); R2/AWS use virtual-hosted style (`false`/unset).
*   `S3_PUBLIC_ENDPOINT` — the URL the **browser** uses for presigned playback.
    Set it whenever the browser reaches storage at a different address than the
    server (e.g. server: `http://minio:9000`, browser: `http://localhost:9000`).
    URLs are *signed* with this host; omit it when both use the same address.

**Bundled MinIO** (compose `selfhost` profile): included automatically —
`R2_ENDPOINT=http://minio:9000`, `S3_REGION=us-east-1`,
`S3_FORCE_PATH_STYLE=true`, `S3_PUBLIC_ENDPOINT=http://localhost:9000`
(see `.env.selfhost.example`); the bucket is created on first start.

**External MinIO** (if you run it yourself outside compose):

Run your S3-compatible storage separately, listening on host port 9000, and
create the private `vosift` bucket using its administration tools. For a service
on the Docker host, use `R2_ENDPOINT=http://host.docker.internal:9000`,
`S3_REGION=us-east-1`, `S3_FORCE_PATH_STYLE=true`, and
`S3_PUBLIC_ENDPOINT=http://localhost:9000`. Compose adds the host gateway mapping
for Linux. On Linux, storage must listen on an address reachable from the Docker
bridge, rather than only 127.0.0.1. If storage is instead a container on the
app's Docker network, use its service name for `R2_ENDPOINT`.

`S3_PUBLIC_ENDPOINT` must also be reachable by hosted transcription services
when they fetch audio by URL. For Soniox/ElevenLabs, localhost playback URLs
cannot be fetched by their servers; use a reachable HTTPS storage endpoint.
Gemini and local Whisper download audio through the app using `R2_ENDPOINT`;
browser playback uses `S3_PUBLIC_ENDPOINT`. Those hosts may differ.

**Cloudflare R2**: `R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`,
`S3_REGION=auto`, path style off, no public endpoint.

**AWS S3**: the regional endpoint, your region, path style off, no public endpoint.

## Transcription providers

`TRANSCRIPTION_PROVIDER` sets the instance default (`soniox`); each user can
override it in Settings → Data Processing. Keys: `SONIOX_API_KEY`,
`ELEVENLABS_API_KEY` (+ optional `ELEVENLABS_MODEL_ID`, default `scribe_v2`),
the Gemini key with optional `GEMINI_MODEL_TRANSCRIPTION`
(default `gemini-2.5-flash`), or any Whisper-API server via `openai_compat`
(`TRANSCRIPTION_COMPAT_BASE_URL` + `TRANSCRIPTION_COMPAT_MODEL`).

Managed metering multiplies raw seconds by `TRANSCRIPTION_PRICING_JSON`
(default `{"soniox":1,"elevenlabs":5,"gemini":0.5,"openai_compat":0.1}`) into
billed units, recorded in the `usage_events` ledger. Self-host writes the same
ledger with gates open, so usage stays visible.

Provider tiers: Soniox and ElevenLabs provide word timestamps and speaker
diarization. Gemini transcription is the budget tier — timestamps are
best-effort and diarization is approximate (confirm quality with your own audio
before relying on it). `openai_compat` (Whisper-API servers) gives word
timestamps with no diarization — the fully self-hostable tier.

## Text AI (summaries, transliteration, embeddings)

`AI_PROVIDER` selects the backend: `gemini` (default, one
`GOOGLE_GENERATIVE_AI_API_KEY` serves transcription, summaries,
transliteration, and embeddings) or `openai_compat` (any OpenAI-API chat +
embeddings server: `OPENAI_COMPAT_BASE_URL` with `/v1`, `OPENAI_COMPAT_API_KEY`
if needed, `OPENAI_COMPAT_CHAT_MODEL`, `OPENAI_COMPAT_EMBEDDING_MODEL`).

Fully-local example: [Ollama](https://ollama.com) with a chat model plus an
embedding model covers summaries, transliteration, and embeddings; pair it
with a Whisper-API server (e.g. Speaches, faster-whisper-server) for
transcription and the whole pipeline runs offline. Base URLs must include the
version path (`http://localhost:11434/v1`, not the bare host).
These servers are operator-run (not bundled in compose); point the *_COMPAT_* variables at them.

In Docker, replace localhost with `host.docker.internal` for AI servers running
on the host, or use their service names on a shared Docker network. Both AI
servers must be reachable from the app container. They are not bundled here.

## Operations

MongoDB data persists in the `mongo-data` volume. Recordings persist in the
`minio-data` volume (bundled MinIO) or your external object-storage bucket
if `R2_ENDPOINT` points elsewhere. Back up the database and whichever
storage you use.
`docker compose down` keeps named volumes; `down -v` deletes them.

Transcription currently runs through Next.js `after()` in the app process.
Wait for active jobs to finish before restarting; jobs are not a durable queue
and an interrupted recording may need transcription retried.

Scheduled exports, billing retries, retention and activity digests use the protected
routes documented in [Cron Jobs](cron-jobs.md). Compose includes the scheduler
under the `selfhost` or `scheduler` profile; set `CRON_SECRET` before starting it.

Next.js builds generate and verify the Serwist service worker. The experimental
vinext/Cloudflare build is separate and is not required for self-hosting.

Atlas vector-index dimensions must match the configured embedding model.
If you change models, re-embed stored summaries and update the index. Unavailable
semantic search falls back to keywords; regular MongoDB supports keyword search.

## Email

Local auth sends verification and password-reset mail via `EMAIL_PROVIDER`:

*   `resend` — recommended for anything real. Needs `RESEND_API_KEY` + `EMAIL_FROM`.
*   `smtp` — your own relay (`SMTP_HOST`, optional port/secure/user/pass).
*   `none` — no mail; accounts verify implicitly. Development only.

Deliverability (SPF/DKIM/domain warmup) is the operator's job either way;
Firebase mode keeps using Firebase's own emails and ignores these settings.

## Optional integrations

All of these can be absent — the app stays fully usable:

*   **Google Contacts sync** — needs `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (+ secret).
    The connect UI hides when unconfigured; contacts from uploads still work.
*   **AI features** (summaries, transliteration, embeddings) — need
    `GOOGLE_GENERATIVE_AI_API_KEY` or an `openai_compat` server (see Text AI
    above). Without either, transcripts save without AI extras.
*   **Sentry** — needs `SENTRY_DSN` (+ `SENTRY_ORG` for release tracking).
    Unset means no error reporting; nothing else changes.

## Scripts

*   `pnpm run dev`: Start dev server (port 9000).
*   `pnpm run build`: Production build (runs the PWA check after).
*   `pnpm run start`: Start production server.
*   `pnpm run lint`: Run ESLint.
*   `pnpm run typecheck`: Run TypeScript compiler check.
*   `pnpm run db:init`: Init database (indexes + seed plans; exits nonzero on failure).
