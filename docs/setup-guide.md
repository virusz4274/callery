# Setup Guide

VoSift ships as one image with two personalities — self-hosted or managed SaaS —
switched purely by environment. `.env.example` is the authoritative variable
reference; this guide explains the choices.

## Prerequisites

*   **Node.js**: v22 or later (v24 LTS recommended), with **pnpm**.
*   **MongoDB**: v6.0 or later — local, Docker (compose `selfhost` profile), or Atlas.
*   **S3-compatible storage**: MinIO, Cloudflare R2, AWS S3, or similar.
*   **One transcription key**: Soniox, ElevenLabs, or Gemini (see below).

Everything else is optional and degrades gracefully (details below).

## Quickstart (self-host)

```bash
cp .env.example .env
# Edit .env: at minimum AUTH_PROVIDER, MONGODB_URI, R2_* storage, one transcription key
pnpm install
pnpm dlx tsx src/lib/db/init.ts   # indexes + seed plans (needs MongoDB up)
docker compose --profile selfhost up   # app (port 3000) + MongoDB
```

Prefer local dev outside Docker? `pnpm run dev` serves on
`http://localhost:9000` (with MongoDB + storage reachable from your machine).

Minimal self-host `.env` (local auth, no billing, no email):

```env
AUTH_PROVIDER=local
NEXT_PUBLIC_AUTH_PROVIDER=local
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
EMAIL_PROVIDER=none
```

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

**External MinIO** (run it yourself; it is not bundled):

```bash
docker run -d --name minio -p 9000:9000 \
  -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin \
  -v minio-data:/data minio/minio server /data
```

then `R2_ENDPOINT=http://minio:9000` (same Docker network as the app),
`S3_REGION=us-east-1`, `S3_FORCE_PATH_STYLE=true`,
`S3_PUBLIC_ENDPOINT=http://localhost:9000`.

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

Warning: every embedding model emits a fixed vector width. Switching embedding
models (or AI providers) without re-embedding breaks vector search — the app
fails fast with a dimension-mismatch error instead of returning wrong results.
Pick one embedding model per deployment and stay on it (the Atlas vector index
dimensions must match it too).

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
*   `pnpm dlx tsx src/lib/db/init.ts`: Init database (indexes + seed plans).
