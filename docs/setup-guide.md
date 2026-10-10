# Setup Guide

VoSift supports self-hosted and managed SaaS deployments from one codebase.
The Docker deployment uses Next.js standalone on Node. Set public settings
before building; `NEXT_PUBLIC_*` values are compiled into the browser bundle.
`.env.example` is the single complete template for native self-hosting, Docker
Compose, and managed deployments. Copy it once and follow the profile comments;
every optional integration is included in that same file.

Copy the template only for a new installation. Preserve an existing `.env`,
including its credentials, provider choices, and public URLs; update only the
settings you intend to change.

## Prerequisites

*   **Node.js**: v24 or later, with **pnpm 12.9.1** (pinned in `package.json`). `.nvmrc` selects the same Node 24 release line as Docker.
    Docker users only need Docker Engine/Desktop with Compose v2.20 or later.
*   **MongoDB**: v6.0 or later for ordinary database operations — local, Docker
    (compose `selfhost` profile), or Atlas. Vector search additionally requires
    MongoDB Search support and the index described in [Search setup](#search-setup).
    The bundled `mongo:8` service has no `mongot` search process, so it provides
    regex keyword search. A separately configured self-managed search deployment
    can support vectors too; follow MongoDB's version and deployment requirements.
*   **S3-compatible storage**: MinIO, Cloudflare R2, AWS S3, or similar.
*   **Transcription**: a Soniox, ElevenLabs, or Gemini key, or a local
    Whisper-compatible server (see below). Organizing and playing recordings
    do not require transcription.

Everything else is optional and degrades gracefully (details below).

## Quickstart (self-host without Docker)

Use your MongoDB server or Atlas cluster and an existing S3-compatible bucket
(such as Cloudflare R2). Set a database name in `MONGODB_URI`; `db:init` creates
the collections, indexes and initial settings, so you do not need to create the
database manually. MongoDB credentials must permit those operations.

```bash
# New installation only; skip this if .env already exists.
cp -n .env.example .env
# PowerShell: if (!(Test-Path .env)) { Copy-Item .env.example .env }
# Keep billing disabled. Set BETTER_AUTH_SECRET, ADMIN_EMAILS,
# MONGODB_URI and the four R2_* values. Follow the storage recipe in the template.
# Configure every REQUIRED IF field for the optional integrations you enable.
corepack enable pnpm
pnpm install --frozen-lockfile
pnpm run db:init
pnpm run dev
```

Open `http://localhost:9000`. The template defaults to this app URL, R2's `auto`
region and path style off. It leaves storage endpoints and credentials blank
so you can supply your own backend. For an upload/playback-only test, disable
automatic transcription in Settings → Data Processing before uploading.

For a tunnel or deployed site, open the saved `NEXT_PUBLIC_APP_URL` instead.
It is the public browser origin used for authentication, callbacks, email and
share links; it is independent of the server's listening address. Keep the
public HTTPS origin even when Next.js listens on localhost. Register OAuth and
webhook URLs with that public origin, and preserve the Contacts callback override.

For native production, build first, then start on the intended listening port:

```bash
pnpm run build
pnpm run start --port 9000
```

The example keeps the native development port. `pnpm run start` without a port
argument listens on 3000; configure the public origin for the deployment before
building rather than deriving it from the internal port.

Run `corepack enable pnpm` once to use the package manager version pinned by this
repository, or prefix commands with `corepack pnpm` if another pnpm version is
installed globally.

## Quickstart (self-host with Docker Compose)

```bash
# New installation only; preserve an existing deployment's .env.
cp -n .env.example .env
# Apply the Docker Compose settings listed at the top of the template.
# Set BETTER_AUTH_SECRET, CRON_SECRET, ADMIN_EMAILS, and MinIO credentials.
# Configure a transcription backend if you want transcription.
docker compose --profile selfhost up --build -d   # app (port 3000) + MongoDB + MinIO
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
still requires a search-enabled MongoDB deployment with the configured vector
search index. `db-init` creates ordinary indexes and seed data; it only prints
the Search/Vector Search definitions. Create those indexes separately below.

With external MongoDB/storage, retain those endpoints, run `pnpm run db:init`
against the external database, then use
`docker compose --profile scheduler up --build -d`. This runs the app and
scheduler without starting the bundled MongoDB/MinIO services. The native
`db:init` command requires the Node/pnpm prerequisites; all endpoints must also
be reachable from the app container.

The app and MongoDB run locally; hosted transcription and AI providers still
receive audio/text. Choose the local Whisper + Ollama recipe below when those
operations also need to stay on your infrastructure.

For access from another computer, replace both localhost URLs with the
browser-reachable app/storage addresses. Use HTTPS for a remote deployment
and PWA installation. `EMAIL_PROVIDER=none` skips email verification and cannot
send password resets; configure SMTP or Resend for those features.

When changing public settings, run the Compose command with `--build` again.
Runtime secrets are excluded from the Docker build context and supplied via
`env_file`. For a direct `docker build`, pass the corresponding public settings
using `--build-arg`; the Dockerfile defaults to billing disabled.

## Deployment profiles

| Concern | Self-host | Managed (SaaS) |
|---|---|---|
| Auth | Better Auth + MongoDB (email/password and optional Google) | Same |
| Billing | Off by default (set nothing, or `NEXT_PUBLIC_ENABLE_BILLING=false`) | `NEXT_PUBLIC_ENABLE_BILLING=true` + Stripe keys |
| Email (`EMAIL_PROVIDER`) | `smtp` / `resend` / `none` | `resend` |
| Transcription | Your Soniox / ElevenLabs / Gemini key | Same, metered with multipliers |
| Storage | Any S3-compatible backend | Same |
| Database | Your MongoDB (compose includes one) | Same (usually Atlas) |

Auth notes:

*   Better Auth stores users, linked accounts and sessions in MongoDB for both
    deployment types. Standalone MongoDB works with adapter transactions disabled.
*   Set a randomly generated `BETTER_AUTH_SECRET` of at least 32 characters.
    `ADMIN_EMAILS` grants admin access after verified authentication, including
    email-verification completion. Signup restrictions and disabled/deleted
    profiles are enforced on the server. Missing profiles are repaired idempotently.
*   Google sign-in is enabled when both Google OAuth credentials exist.
    `GET /api/auth/capabilities` reports login, verification and recovery availability
    without connecting to MongoDB or disclosing credentials.

Billing notes:

*   Billing is **off unless** `NEXT_PUBLIC_ENABLE_BILLING=true`. When off,
    quotas don't enforce, Stripe is never called, and pricing/billing UI hides.
*   When on, `STRIPE_SECRET_KEY` (+ webhook secret for subscription sync) is required.

Public pages follow the billing flag as well. When billing is off or unset, `/`
opens `/recordings` (preserving query parameters), with the usual login flow for
signed-out visitors. Pricing, changelog, Terms and Privacy pages return 404 and
their navigation links are hidden. Support links and `/support` lead to
[GitHub Issues](https://github.com/virusz4274/Vosift/issues), where users can review
existing issues or raise a new one. `POST /api/support` returns 403 with `error`
and `supportUrl` without storing a message or sending email. The sitemap is empty,
crawling is disallowed, and page metadata requests no indexing. Setting
`NEXT_PUBLIC_ENABLE_BILLING=true` restores the managed public pages and support form.
As with other `NEXT_PUBLIC_*` settings, rebuild production browser bundles after
changing this flag. There is no separate deployment-mode setting.

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
(see the Docker Compose recipe in `.env.example`); the bucket is created on first start.
MinIO root credentials come from environment variables at startup. If you rotate
them, recreate the affected containers and update clients using those credentials;
preserve the `minio-data` volume. See
[MinIO's configuration reference](https://github.com/minio/minio/blob/master/docs/config/README.md).

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
(default `gemini-3.8-flash`), or any Whisper-API server via `openai_compat`
(`TRANSCRIPTION_COMPAT_BASE_URL` + `TRANSCRIPTION_COMPAT_MODEL`).

Managed metering multiplies raw seconds by `TRANSCRIPTION_PRICING_JSON`
(default `{"soniox":1,"elevenlabs":5,"gemini":0.5,"openai_compat":0.1}`) into
billed units, recorded in the `usage_events` ledger. Self-host writes the same
ledger with gates open, so usage stays visible.

Provider tiers: Soniox and ElevenLabs provide word timestamps and speaker
diarization. Set `GEMINI_MODEL_TRANSCRIPTION=gemini-3.5-transcribe` for Gemini's
dedicated speech-to-text model with native speaker labels and word timestamps.
The app uses verbatim mode with both features enabled, which limits recordings
to 30 minutes; Google describes speaker attribution for 3+ speakers as experimental.
For longer recordings, use `gemini-3.8-flash` (the blank-value default): its
prompted timestamps are best-effort and diarization is approximate. See Google's
[transcription guide](https://ai.google.dev/gemini-api/docs/transcribe).
`openai_compat` (Whisper-API servers) gives word
timestamps with no diarization — the fully self-hostable tier.

## Text AI (summaries, transliteration, embeddings)

`AI_PROVIDER` selects the backend: `gemini` (default, one
`GOOGLE_GENERATIVE_AI_API_KEY` serves transcription, summaries,
transliteration, and embeddings) or `openai_compat` (any OpenAI-API chat +
embeddings server: `OPENAI_COMPAT_BASE_URL` with `/v1`, `OPENAI_COMPAT_API_KEY`
if needed, `OPENAI_COMPAT_CHAT_MODEL`, `OPENAI_COMPAT_EMBEDDING_MODEL`).

All Gemini features have independent server-side model settings:

| Feature | Environment variable | Default when blank or unset |
| --- | --- | --- |
| Audio transcription | `GEMINI_MODEL_TRANSCRIPTION` | `gemini-3.8-flash` |
| Summary | `GEMINI_MODEL_SUMMARY` | `gemini-3.8-flash` |
| Transliteration | `GEMINI_MODEL_TRANSLITERATION` | `gemini-3.8-flash` |
| Embeddings / semantic search | `GEMINI_MODEL_EMBEDDING` | `gemini-embedding-001` |

For example, choose the dedicated transcription model and a separate text model:

```dotenv
GEMINI_MODEL_TRANSCRIPTION=gemini-3.5-transcribe
GEMINI_MODEL_SUMMARY=gemini-3.5-flash-lite
GEMINI_MODEL_TRANSLITERATION=gemini-3.5-flash-lite
GEMINI_MODEL_EMBEDDING=gemini-embedding-001
```

Summary and transliteration settings do not change the audio model. Restart the
app after editing `.env` (recreate the app container for Docker deployments).
Changing summary/transliteration models does not change the embedding dimensions.

Choose models available to your API key. Google restricts Gemini 2.5 models
to existing users; see the [Gemini deprecations guide](https://ai.google.dev/gemini-api/docs/deprecations).
Changing the embedding model requires re-embedding recordings and matching the
Atlas vector index dimensions. The model settings do not expose Gemini's full
generation API: task prompts, response formats, and native transcription options
are defined in code.

Fully-local example: [Ollama](https://ollama.com) with a chat model plus an
embedding model covers summaries, transliteration, and embeddings; pair it
with a Whisper-API server (e.g. Speaches, faster-whisper-server) for
transcription and the whole pipeline runs offline. Base URLs must include the
version path (`http://localhost:11434/v1`, not the bare host).
These servers are operator-run (not bundled in compose); point the *_COMPAT_* variables at them.

In Docker, replace localhost with `host.docker.internal` for AI servers running
on the host, or use their service names on a shared Docker network. Both AI
servers must be reachable from the app container. They are not bundled here.

## Search setup

Ordinary recording and contact searches query MongoDB before pagination, within
the authenticated account. Recording text search covers transcript text,
summaries, contact names, numbers, filenames and tags; contacts search covers
names, numbers, companies and job titles. These searches work without Search
indexes. The recording page uses MongoDB regex queries; `/api/recordings` also
tries the optional full-text index before regex fallback.

AI search combines keyword matches with approximate vector matches from saved
**summary** embeddings (`recordings.summaryEmbedding`), rather than embedding
every transcript passage. It excludes archived recordings and filters by
`authSubject`. Recordings without saved summary embeddings remain eligible for
keyword matching but cannot match by vector similarity. Vector results are a
bounded ranked result set; the displayed AI match count is not an exhaustive
count of every semantically related recording.

MongoDB Atlas manages the search process for you. Self-managed search requires
an additional `mongot` deployment; it is not included in this repository's
Compose profile. See MongoDB's
[self-managed search instructions](https://www.mongodb.com/docs/search/self-managed/current/).

### Required vector index

In Atlas, open Search index management for the **database named in
`MONGODB_URI`**, select the **`recordings` collection**, and create a
**Vector Search** index named **`recordings_vector_search`**. Use this JSON
definition (also printed by `pnpm run db:init`):

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "summaryEmbedding",
      "numDimensions": 3072,
      "similarity": "cosine"
    },
    { "type": "filter", "path": "authSubject" },
    { "type": "filter", "path": "isArchived" }
  ]
}
```

Both filter fields are required by the app's vector query. The 3072 dimensions
match the default `gemini-embedding-001` output; the app does not request a
reduced output width. For another embedding model/provider, use its actual
output width and use the same model for stored summaries and search queries.
Equal vector widths alone do not make different models' embeddings compatible.
See [Google's embedding guide](https://ai.google.dev/gemini-api/docs/embeddings).

This is a `vectorSearch` index, not an ordinary `createIndex()` index or a
full-text `search` index. Index names are fixed in the current app code.
If creating it with `mongosh` on Atlas, use
`db.recordings.createSearchIndex("recordings_vector_search", "vectorSearch", definition)`
where `definition` is the JSON object above. The account creating the index
needs the relevant Search index management permission. Refer to
[MongoDB's createSearchIndex reference](https://www.mongodb.com/docs/manual/reference/method/db.collection.createSearchIndex/).

### Optional full-text index

The API's fuzzy full-text search uses a separate **Search** index named
**`recordings_text_search`**, on the same collection. It is optional for AI
vector search and is not needed for ordinary recording-page or contact search.
Its definition is:

```json
{
  "mappings": {
    "dynamic": false,
    "fields": {
      "authSubject": { "type": "string" },
      "summary": { "type": "string" },
      "contactName": { "type": "string" },
      "fileName": { "type": "string" },
      "standardizedDisplayName": { "type": "string" },
      "tags": { "type": "string" },
      "fullTranscript": {
        "type": "document",
        "fields": { "text": { "type": "string" } }
      }
    }
  }
}
```

Phone-number queries use the API's regex path because `phoneNumber` is not in
this full-text mapping.

### Verify readiness and stored embeddings

Index creation is asynchronous. Wait until the vector index is ready and
`queryable: true`. In `mongosh`, select the application's database and inspect:

```javascript
db.recordings.aggregate([
  { $listSearchIndexes: { name: "recordings_vector_search" } }
]).toArray()

db.recordings.aggregate([
  { $match: { "summaryEmbedding.0": { $exists: true } } },
  { $group: { _id: { $size: "$summaryEmbedding" }, recordings: { $sum: 1 } } }
]).toArray()
```

The first query must show the correctly named, queryable index; an empty list
means it is absent in that database/collection. The second reports stored
embedding widths and counts without displaying transcripts. For the default
Gemini embedding model, expect `_id: 3072`. An empty result means no saved
embeddings are available yet. Search indexes are separate from the ordinary
indexes returned by `getIndexes()`.

Then use AI search with a topic from a completed recording whose summary was
embedded. A successful transcription alone is insufficient: the app saves a
summary embedding only when summary generation succeeds. Creating an index
indexes existing stored vectors; it does not generate missing embeddings.
Retry transcription to run the current summary/embedding pipeline for an
individual recording that is missing them. There is no dedicated bulk
re-embedding command in the current scripts.

If an embedding request fails or MongoDB rejects the vector query, the search
action reports keyword fallback. A missing index can instead return no vector
results without throwing, so keyword results or a missing fallback badge do
not prove vector search works. Verify the index explicitly. `/api/health`
checks only MongoDB connectivity, and the admin AI probe checks embedding
generation; neither confirms that the vector index is ready.

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

Before switching embedding models/providers, plan to regenerate all stored
summary embeddings with that same model and update the vector index width as
needed. See [Search setup](#search-setup) for index creation and verification.

## Email

Better Auth sends verification and password-reset mail via `EMAIL_PROVIDER`:

*   `resend` — recommended for anything real. Needs `RESEND_API_KEY` + `EMAIL_FROM`.
*   `smtp` — your own relay (`SMTP_HOST` + `EMAIL_FROM`, optional port/secure/user/pass).
*   `none` — testing only: accounts verify automatically and recovery is unavailable.

Configure SMTP or Resend for deployed verification and recovery. Signup without
a session shows a check-email confirmation; duplicate signup responses stay generic.
Verification returns to login with the sanitized destination preserved.
Password resets revoke existing sessions. Password controls appear only for linked
credential accounts; Google-only accounts have no current password to change.
Deliverability (SPF/DKIM/domain warmup) is the operator's job.

## Google login and Contacts

Create one OAuth **Web application** client and set `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
and server-only `GOOGLE_CLIENT_SECRET`. Register both exact callbacks on that client:

| Flow | Native development callback |
|---|---|
| Login/signup | `http://localhost:9000/api/auth/callback/google` |
| Contacts connection | `http://localhost:9000/api/auth/google/callback` |

Use your HTTPS app origin for deployments (Compose defaults to localhost:3000).
`NEXT_PUBLIC_GOOGLE_REDIRECT_URI` overrides only the Contacts callback. Enable
the People API, configure the consent screen and add test users when required.
Login requests identity permissions only; users connect Contacts separately in
Settings to authorize `contacts.readonly`. Login does not start Contacts sync.
Partial credentials produce an error naming the missing variable without its value.
Each request's redirect URI must exactly match its registered callback; see
[Google OAuth guidance](https://developers.google.com/identity/protocols/oauth2/web-server).

## Optional integrations

All of these can be absent — the app stays fully usable:

*   **Google Contacts sync** — configure `NEXT_PUBLIC_GOOGLE_CLIENT_ID`,
    `GOOGLE_CLIENT_SECRET`, and `GOOGLE_TOKEN_ENCRYPTION_KEY` together in the
    template's Google section. `GOOGLE_TOKEN_ENCRYPTION_KEY_VERSION` defaults
    to `v1`. The callback is `${NEXT_PUBLIC_APP_URL}/api/auth/google/callback`
    unless `NEXT_PUBLIC_GOOGLE_REDIRECT_URI` is set; register the exact callback
    URL in your Google OAuth client. Keep the encryption key stable or reconnect
    Google accounts after replacing it. Authorization requires both OAuth
    credentials. Recordings can still be uploaded, searched, and played without
    synced contacts. The Gemini API key is separate from this integration.
*   **AI features** (summaries, transliteration, embeddings) — need
    `GOOGLE_GENERATIVE_AI_API_KEY` or an `openai_compat` server (see Text AI
    above). Without either, transcripts save without AI extras.
*   **Sentry** — set `SENTRY_DSN` for server errors and `NEXT_PUBLIC_SENTRY_DSN`
    for browser errors. Optional build-time source-map uploads require all three
    of `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN`. See the template's
    Sentry section. With both DSNs absent, error reporting is disabled.

## Scripts

*   `pnpm run dev`: Start dev server (port 9000).
*   `pnpm run build`: Production build (runs the PWA check after).
*   `pnpm run start`: Start the built production server (port 3000 by default).
*   `pnpm run lint`: Run ESLint.
*   `pnpm run typecheck`: Run TypeScript compiler check.
*   `pnpm run db:init`: Create ordinary indexes, seed plans/settings, and print
    Search index definitions; exits nonzero on failure. Does not create Search indexes.

`pnpm check` runs typechecking, lint, tests, dependency checks, and the security
audit. MongoDB integration tests are opt-in: set `VOSIFT_TEST_MONGODB_URI` to a
reachable test MongoDB before running it. Each integration suite creates and
drops a randomly named database; it does not use the application database.
Without that variable, the integration suites are reported as skipped.

The historical auth-unification validation on 2026-10-06 used `pnpm run check` (112 application
tests, including isolated standalone MongoDB auth/cleanup tests, and five dependency
tests), production builds with billing off/on, and eight Playwright browser tests.
Browser upload/transcription checks used local storage and AI fixtures. Verification
and recovery used captured email fixtures. Google credentials were saved during
verification and preserved untouched. Live Google login succeeded, preserved the
requested destination, and left Contacts disconnected; the registered callbacks
were verified on the same web client. Live Contacts sync was skipped at the user's
request; no Contacts permission was granted or contacts imported. Callback, scope
and redirect separation was also checked with fixtures.
Docker container startup and live SMTP/Resend delivery were not exercised.
