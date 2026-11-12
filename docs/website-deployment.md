# Website deployment and domain cutover

Callery has two independently built applications in this repository:

| Application | Source | Public destination |
| --- | --- | --- |
| Static marketing site, guides, public documentation, and legal pages | `website/` | `https://getcallery.com` |
| Accounts, recording archive, checkout, support forms, APIs, and PWA | Repository-root Next.js app | `https://app.getcallery.com` |

These public origins are recorded in `deployment/production.json`. This file contains no credentials. The shared self-host test deployment remains at `https://vosift.coarde.com`; its saved `.env`, providers, credentials, Contacts callback, and running process are separate from the production profile.

## Cloudflare Pages

The Astro website is served by the `callery-website` Cloudflare Pages project. It needs no application server or runtime credentials. Use:

| Setting | Value |
| --- | --- |
| Project name | `callery-website` |
| Production branch | `main` |
| Root directory | Repository root |
| Build command | `pnpm website:build:production` |
| Build output directory | `website/dist` |
| Node version | `24.22.0` or a compatible newer host runtime |
| Package manager | `pnpm@12.14.0`, pinned by the repository |

Use `NODE_VERSION=24.22.0` and `PNPM_VERSION=12.14.0` in Pages build settings when explicit overrides are needed. The manual upload command uses the installed Wrangler CLI; verification used host Wrangler 4.156.0.

Install from the committed lockfile with `pnpm install --frozen-lockfile`. Configure the build environment's Node/pnpm versions using the hosting provider's normal settings. Do not substitute a bundled agent runtime. The Astro output is static: it needs no Next.js adapter, database connection, object storage, or app secrets. For a manual release with an already authenticated host Wrangler, run `pnpm website:deploy:production`; it uploads to the existing Git-integrated Pages project. Choose the account that owns `getcallery.com` through the CLI environment or provider settings.

The production build command reads both domains from the committed profile. Generic `pnpm website:build` continues to accept these variables for other deployments:

- `SITE_URL`: `https://getcallery.com` for this deployment.
- `PUBLIC_APP_URL`: `https://app.getcallery.com` for this deployment.
- `SITE_LAUNCH_STAGE=coming-soon|open`: defaults to `coming-soon`; invalid values fail the build. Keep the current website in `coming-soon` while managed app services are being prepared.
- `SITE_INDEXABLE=true`: allows production launch pages and reviewed guides to be indexed without finalized pricing. The production wrapper defaults to `true`; explicit `false` suppresses indexing. Generic builds remain non-indexable unless explicitly enabled.

Use `SITE_LAUNCH_STAGE=coming-soon` and `SITE_INDEXABLE=true` in the production Pages build settings. Coming-soon pages display a non-clickable **Launching soon** status instead of linking to managed signup, login, checkout, support, or live API settings. Demo, self-hosting, compatibility, and documentation remain available; there is no waitlist form or email collection. Pricing says it will be announced, is non-indexable, and stays out of the sitemap even if a saved catalog exists. The 404 page is also excluded.

Preview builds are non-indexable in either launch stage, and their canonical links still identify the configured main domain. An `open` build restores links to the configured app origin. Keep a `404.html` response for unknown paths rather than rewriting every URL to the homepage.

Astro emits `page.html` files with extensionless canonical URLs to match Pages routing and a real `404.html` fallback. Keep the generated `_headers` file with the output; it carries preview indexing and static asset headers. The deployment's canonical origin is always `https://getcallery.com`.

The website build must watch `website/` (including its committed screenshot sources in `website/src/assets/screenshots/`), the published Markdown in `docs/`, `deployment/production.json`, its shared pricing contract, the workspace/lockfile, and applicable root scripts. App-only changes do not require a website publication unless they affect its exported pricing or content. The complete repository checkout is needed because documentation and the pricing contract are imported from outside the website package. The local video package is not a build dependency. Screenshot provenance and fictional-data limits are recorded in `website/README.md`; publish only the four reviewed PNG copies, without demo audio or private original captures. Enable automatic Git builds after publishing the repository changes; a manual upload does not commit or push source. See [Pages Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/) and [monorepos](https://developers.cloudflare.com/pages/configuration/monorepos/).

## Pricing release workflow

1. Deploy the managed app separately with a read-only `/api/public/pricing` export, then publish and review its real catalog. The export endpoint is outside this static-site release; the current `coming-soon` site uses a null snapshot and requires no app API.
2. Run `pnpm website:sync-pricing --from https://app.getcallery.com` from the repository root.
3. Review the changes to `website/src/data/pricing.json`. Confirm amounts, currency, allowances, public usage rates, and availability.
4. After the managed app's production services and signup pass acceptance checks, set `SITE_LAUNCH_STAGE=open`. Commit the reviewed snapshot, run the website checks/build, and publish the website version.

The sync endpoint is read-only. It does not modify Stripe or the database. It is unavailable for self-hosted billing-disabled deployments and fails on an unreadable managed catalog. Sync failures preserve the last good snapshot. Site builds use the saved snapshot without contacting the app. A real matching snapshot is required for indexable `open` builds; the `coming-soon` site can be indexed with a null snapshot. A present snapshot must match the app origin for an indexable build, and malformed snapshots fail in both stages.

Repeat this workflow whenever public pricing changes. In `open`, the website's buttons open live app pricing, rather than sending saved Stripe IDs to checkout. Availability can change after a snapshot was published; the app remains authoritative for a purchase. Keep `coming-soon` until the app is ready rather than exposing unavailable signup routes.

## Configure app links

The app's existing `NEXT_PUBLIC_APP_URL` continues to mean the app origin. Do not point it at the marketing domain. Authentication, OAuth, provider callbacks, API resources, emails, share links, PWA installation, and push belong to that origin.

The optional `NEXT_PUBLIC_MARKETING_URL` points from the app to the main website. When configured with a distinct valid origin, legal, update, and documentation links lead to fixed website paths. Legacy GET/HEAD requests to `/privacy-policy`, `/terms-of-service`, `/changelog`, and `/developers` redirect there without copying app query parameters. Those information pages are removed from the app. Unconfigured instances return 404 for the legal/update routes and send `/developers` to the GitHub integration guide; documentation links also fall back to GitHub.

The website publishes nine curated documents under `/docs`, including the integration API, MCP connection guide, and API reference. Internal engineering notes and operator runbooks remain on GitHub. Each app instance keeps its live `/api/v1/openapi.json` contract and credential settings, since those describe and control that deployment. Managed `/pricing` and `/support` remain in the app for checkout and support submission. The app root opens the recording workspace and all app pages remain non-indexable.

The existing app site profile contains support/sales mailboxes under `callery.com`. Verify ownership and delivery of the final contact addresses before a commercial launch; buying a different domain does not make those mailboxes valid. The static website does not publish those unverified addresses and links to app support only in the `open` launch stage.

Public `NEXT_PUBLIC_*` values are compiled into the app's browser bundle. Supply the intended values through the existing native or Docker build configuration and rebuild the relevant deployment. Do not edit an existing deployment's `.env` merely to test the website.

## Production app on Workers

`pnpm build:vinext:production` applies the public production profile to a Vinext build. It selects Worker `callery`, custom domain `app.getcallery.com`, `NEXT_PUBLIC_APP_URL=https://app.getcallery.com`, `NEXT_PUBLIC_MARKETING_URL=https://getcallery.com`, and managed billing. Generic Vinext and Node commands retain their existing deployment behavior.

The matching `pnpm deploy:vinext:production` command uses the same profile. Configure the intended Cloudflare account and the deployment's runtime settings in the provider before invoking it. This command publishes the application and domain; it is not a local preview. A successful bundle does not close the runtime acceptance gaps in [the Workers guide](cloudflare-workers.md).

Run the production app commands from an isolated source checkout without `.env` or `.dev.vars` files and supply reviewed production settings explicitly. The wrapper refuses a checkout containing deployment files before starting the build or deployment; it does not read or change their contents. This prevents automatic loading of the shared self-host configuration into a production build.

The production Worker declares secret slots for MongoDB, Better Auth, S3/R2 access, Resend, Stripe, and cron authorization. Supply values only through Cloudflare's secret store. Supply nonsecret settings such as the storage endpoint/bucket, verified sender, and provider/model choices through deployment configuration. Add feature-specific secret bindings when enabling Google Contacts, transcription, push, or other integrations. Do not copy the shared self-host test credentials into production or generate replacement encryption/signing keys for an existing archive.

Provider callback registrations use the app origin: Google sign-in `/api/auth/callback/google`, Google Contacts `/api/auth/google/callback`, and the configured webhook routes. Register exact URLs with the relevant provider before offering those integrations. Production database, storage, email, payment configuration, and authenticated Workers acceptance are required before routing real app traffic.

## Domain cutover

After buying the domain and preparing the managed app:

1. Attach `getcallery.com` to the `callery-website` Pages project as a custom domain and configure its proxied apex CNAME to `callery-website.pages.dev`. The hostname must belong to the selected account's active zone. Resolve any existing conflicting hostname association before attaching it. The apex is canonical; a `www` alias can be added separately if desired.
2. Route the app subdomain to the managed app. Configure its public app origin and the website's app link origin consistently before building.
3. Register the new app callback/webhook URLs with each configured provider. Check email links, Google Contacts, sign-in, API/MCP connections, playback storage access, sharing, and push.
4. Keep compatibility for existing app links at the old host where appropriate. Do not redirect API or OAuth traffic indiscriminately to the marketing homepage.
5. Expect users moving to a new app origin to sign in again. Reconnect origin-bound integrations and reinstall/re-enable the PWA or push when needed; browser cookies and permissions do not migrate to a different origin.
6. Verify canonical metadata, social previews, robots rules, JSON-LD, guide links, and visible pricing on the final public website. Submit its sitemap in Search Console and review indexing there.

A code deployment does not buy a domain, create DNS records, migrate data, or authorize a restart of the shared test server. Schedule those operational actions separately using the final domain and provider configuration.

## Content checks

Run `pnpm website:check` and `pnpm website:build`, plus the website tests provided by the package. Review mobile and desktop layouts with the generated site. App changes should also pass the repository checks and the relevant managed/self-host acceptance scenarios.

When adding device instructions, use primary manufacturer/dialer documentation and real sample filenames where available. First-hand community ADB procedures must be labelled, scoped to the reported model/build, and distinguish dialer restoration from verified folder access and Callery import. Include prerequisites, missing-package stop conditions, prior-state capture, rollback, and normal-calling checks. Track applicability by model, region, OS, and dialer rather than assuming all phones from a brand behave alike. Update the source-review date only after reviewing the evidence. Published guides must explain recording availability, accessible original files, accepted audio formats, and automatic caller/date recognition separately.

Review the selected screenshot assets on desktop and mobile, preserve their fictional-data captions, and do not publish private captures. Validate both launch stages: coming-soon has no active managed app links or saved price offers; open requires matching published pricing for indexing. Verify the live sitemap, robots headers/meta tags, canonical URLs, and structured data after Pages publication. No language, provider-training, storage-encryption, or mobile auto-sync promise should be added without evidence.

The legal pages retain their existing wording and October 26, 2023 update date. Review that content deliberately before a managed commercial launch; a framework migration must not fabricate a new legal revision date or release history.
