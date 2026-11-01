# Experimental Cloudflare build

Docker/Node with Next.js is the current supported launch target. The committed vinext/Vite/Workers configuration prepares a future primary deployment target while keeping Node support. The default `dev`, `build` and `start` commands still run Next.js. Switching production to Workers requires the separate runtime-parity acceptance described below.

```sh
pnpm dev:vinext
pnpm build:vinext
pnpm start:vinext
```

The 2026-10-18 package update uses vinext 1.2.1, its Cloudflare adapter 1.1.1, Vite 8.3.4, the Cloudflare Vite plugin 2.0.0-beta.v.1 and `cf` 1.0.0-beta.18. Both the production build and local workerd preview were exercised. Auth uses Better Auth and MongoDB in every deployment; a successful bundle does not establish production readiness.

`cloudflare.config.ts` defines the Worker and `nodejs_compat`. Its runtime secret slots are currently commented examples: declare the required `bindings.secret()` entries (including MongoDB and Better Auth) and supply their values through the provider's secret store before deployment. Node's deployment `.env` is not automatically the Worker's environment. Match the configured email provider to its required bindings. Public settings must match the chosen auth/billing profile at build time, including the saved public HTTPS origin. Workers still need reachable MongoDB and S3-compatible storage.

`vite.config.ts` strips Next's standalone setting and prebundles storage SDKs in development. Its brand-image plugin embeds the existing PNG as a data URL during the Vite build: static assets do not appear under `/bundle/public`, so the Node module's eager filesystem read previously prevented dynamic Worker routes from starting. The Next.js image module remains unchanged. The tr46 patch and punycode aliases are retained for URL-parser compatibility.

## Local verification

Verification used an isolated source/dependency installation without deployment `.env` files. Fixture bindings were applied only to its generated Worker configuration, with disposable MongoDB and memory-only S3 on loopback ports. No Worker was deployed and no account credentials were used.

- Login, the web manifest, brand PNG, Open Graph image and Twitter image return 200.
- With fixture bindings, database health returns 200, the anonymous profile API returns 401, session lookup returns `null`, and invalid email/password sign-in returns 401.
- Signup and public system-settings requests are canceled by workerd as hung. The cause needs investigation before authenticated Workers use can be claimed.
- `vinext check` reports 86% compatibility. Three flagged Next internal imports belong only to the Node test harness. The remaining unsupported option is `experimental.proxyClientMaxBodySize`. The image optimizer is already configured; Sentry's webpack build features are not supported.

## Configuration and lifecycle verification

Server defaults live in the lazy `src/lib/config.ts` implementation; `env.ts`
is a compatibility export and `public-env.ts` is independent of server secrets.
Both runtime builds must run in separate temporary source snapshots, excluding
saved environment files and generated `.next`, `.vinext`, `.cloudflare` and
`dist` output. Do not run concurrent builds against the shared checkout or reuse
one runtime's generated route declarations for the other.

Run the narrow adapter check with the project's host Node version:

```sh
pnpm test:runtime
pnpm build:runtimes
```

The lifecycle test uses the already installed esbuild and Miniflare/workerd dependencies, creates
only temporary fixture files and a local worker, and disposes them afterward.
It calls no application database, email provider, transcription provider or
payment endpoint. `build:runtimes` runs both production builds in separate temporary source snapshots. `after` is a request-lifetime mechanism, not a durable queue;
the existing MongoDB job state and recovery schedules remain necessary.

## Remaining verification gaps

- vinext ignores the webpack integration. Serwist/PWA behavior is verified only on Node.
- Google Contacts now uses function-form `next/server.after`, matching other post-response entry points. A narrow lifecycle test verifies the installed Next request context and the installed vinext shim on real local workerd: a deferred callback completes once after the response closes, and its failure handling also runs. This does not certify whole-application request lifetime, SMTP, or long-running Contacts imports.
- ZIP exports write entire archive parts to temporary files, with a 500 MB part limit. Workers' temporary filesystem uses memory and requires a different strategy for large exports.
- Scheduled jobs need an HTTP caller; see [scheduled jobs](cron-jobs.md).
- Some routes are reported as unclassified. Routing and auth require a deployment test after resolving the local request cancellations.

vinext may write types under `.next`. `pnpm typecheck` regenerates Next's route types before TypeScript so the builds do not leave conflicting declarations.

Workers deployment remains opt-in until authenticated requests, email, production-size exports, scheduled recovery and PWA parity pass their own acceptance tests. Preserve the compatibility patches until isolated checks show they are unnecessary. Use the [Node setup guide](setup-guide.md) for the currently supported launch and [reconciliation record](branch-reconciliation.md) for preserved inputs and verification boundaries.
