# Hosting on Cloudflare Workers (via vinext)

This app is a Next.js App Router project that can also be built and hosted on
Cloudflare Workers with [vinext](https://vinext.dev) (a Vite plugin that
reimplements the Next.js API surface). The Next.js toolchain keeps working
unchanged — vinext lives alongside it.

| Task              | Next.js (Node/Docker/Vercel) | vinext (Cloudflare Workers) |
|-------------------|------------------------------|-----------------------------|
| Dev server        | `pnpm run dev`               | `pnpm run dev:vinext`       |
| Production build  | `pnpm run build`             | `pnpm run build:vinext`     |
| Preview production| `pnpm run start`             | `pnpm run start:vinext`     |
| Deploy            | Dockerfile / Vercel          | `pnpm run deploy:vinext`    |

## How it fits together

- `vite.config.ts` — vinext + `@cloudflare/vite-plugin` (RSC runs in
  workerd). It reuses `next.config.ts` with `output: "standalone"` stripped,
  because standalone emission conflicts with the Workers build. Next.js still
  loads `next.config.ts` from disk with `output: "standalone"` intact.
- `cloudflare.config.ts` — typed Worker config (`cf`): name, compatibility
  date/flags (`nodejs_compat`), static assets, image optimization, and
  non-secret vars. Secrets are set separately (below), never committed.
- `patches/tr46@5.1.1.patch` — one-line pnpm patch (see "Known issues").
- Runtime shims kept dual-platform: Stripe uses the fetch HTTP client,
  the S3/R2 client uses the fetch HTTP handler, nodemailer loads lazily
  (SMTP is Node-only), and Firebase Admin reads env credentials first
  without touching `fs`. All of these behave identically under Next.js.

## Environment & secrets

Three different mechanisms, depending on the stage:

1. **Local vinext dev** (`pnpm run dev:vinext`, port 3001): reads `.env`
   (same file as Next.js dev). Copy `.env.example` to `.env` and fill in
   at least `MONGODB_URI`, `AUTH_PROVIDER` + `NEXT_PUBLIC_AUTH_PROVIDER`,
   `BETTER_AUTH_SECRET`, and `NEXT_PUBLIC_APP_URL=http://localhost:3001`.
2. **Client bundle build time**: `NEXT_PUBLIC_*` values are inlined into the
   client bundle when `build:vinext` runs. They must be present in the build
   environment (local `.env`, or CI variables) — setting them only as Worker
   secrets is too late for the client bundle.
3. **Deployed Worker runtime**: server-side `process.env` comes from Worker
   vars + secrets. Non-secret vars live in `cloudflare.config.ts` as
   `bindings.text(...)`; secrets are created with the CLI and referenced as
   `bindings.secret()`:

```bash
pnpm exec cf auth login
pnpm exec cf workers secrets put MONGODB_URI
pnpm exec cf workers secrets put BETTER_AUTH_SECRET
pnpm exec cf workers secrets put RESEND_API_KEY
# ... any other secret from .env.example your deployment needs
pnpm run deploy:vinext
```

Set `accountId` in `cloudflare.config.ts` or export `CLOUDFLARE_ACCOUNT_ID`.
In CI, use `CLOUDFLARE_API_TOKEN` (Edit Cloudflare Workers template) instead
of browser login. Validate without deploying with
`pnpm exec vinext-cloudflare deploy --dry-run`.

## Services on Workers

- **MongoDB**: the official Node driver works in workerd via `node:net`
  (outbound TCP) with `nodejs_compat`. Use MongoDB Atlas; Workers have
  dynamic egress IPs, so either allowlist `0.0.0.0/0` with a strong password
  or use a private endpoint. Both `mongodb://` and `mongodb+srv://` URIs are
  supported (`node:dns` resolves SRV records over DoH).
- **Auth**: `AUTH_PROVIDER=local` (better-auth + MongoDB) is fully verified
  on Workers (signup, sessions, authed API). `AUTH_PROVIDER=firebase` is
  code-safe on Workers (env credentials, no `fs`) but was not exercised
  end-to-end here — verify with Firebase credentials before relying on it.
- **Email**: use `EMAIL_PROVIDER=resend` on Workers. `smtp` (nodemailer)
  requires Node.js and fails with an actionable error on Workers.
- **Object storage**: any S3-compatible backend over HTTPS (R2, AWS, MinIO).
  For R2, `R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com` with
  an R2 API token. Large uploads: Workers request bodies are limited
  (~100 MB), so the 2 GB server-action limit in `next.config.ts` does not
  apply on Workers — keep browser uploads under ~100 MB there (direct
  browser-to-R2 resumable uploads are a possible future improvement).
- **Stripe**: API calls use the fetch HTTP client (works on Workers);
  webhooks verify signatures with WebCrypto-compatible HMAC.
- **Cron** (`/api/cron/purge-recordings`, `/api/cron/digest`): these are
  plain HTTP routes (see `vercel.json` for schedules). Workers Cron Triggers
  fire `scheduled` events, not HTTP requests, so point an external scheduler
  (or a tiny scheduled Worker that fetches the URLs) at them.

## Verified on workerd (local)

`vite build` + `vite dev` (workerd) against in-memory MongoDB, local auth:

- SSR pages: `/`, `/login`, `/settings`, `/contacts`, `/upload` → 200
- Signup → session cookie → authed `GET /api/user/profile`,
  `/api/recordings`, `/api/stats` → 200 with correct JSON
- Auth-mode gating (`/api/auth/login` → 404 in local mode), static assets
- `typecheck` clean, `lint` shows only pre-existing findings,
  `vinext-cloudflare deploy --dry-run` passes

## Known issues / limitations

- **Dev first-touch flakes**: the vinext dev runner sometimes serves a
  broken transform for a route first requested while dependencies are still
  being optimized (surfacing as a miniflare "hung" page or 500). Retrying —
  or touching the file to re-transform — resolves it. Production builds are
  unaffected (fully bundled ahead of time).
- **tr46 patch**: `tr46@5.1.1` (via the MongoDB driver's URL parser) does
  `require("punycode/")`, which the dev runner externalizes; workerd has no
  `require`, so dev crashes. The patch rewrites it to a relative require of
  pnpm's nested copy of the same file. Upstream:
  https://github.com/cloudflare/vinext/issues/720 — drop the patch if a
  future vinext release fixes dev externalization.
- **`vite preview` ignores env**: preview serves the production bundle but
  does not load `.dev.vars`, `cloudflare.config.ts` vars, or shell env, so
  authenticated/DB-backed pages 500 there. Use `vite dev` for local
  verification, or deploy a preview Worker.
- **PWA service worker**: Serwist runs during vinext builds but no `sw.js`
  lands in the Workers output, so offline support is currently Next-only.
  The app works online on Workers.
- **Sentry**: works for error capture; build-time features (source-map
  upload, auto-instrumentation) don't run under vinext.
- **`experimental.proxyClientMaxBodySize`** in `next.config.ts` is ignored
  by vinext (server-action `bodySizeLimit` is honored).
- Transcription/Workers CPU limits: long transcription polling runs inside
  requests; on the Workers free plan the 30 s CPU limit may cut long jobs
  short. Paid plans raise this; moving transcription to Queues/Workflows is
  a possible future improvement.
