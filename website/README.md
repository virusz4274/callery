# Callery website

This Astro package builds the public marketing site, recording guides, documentation, and legal pages as static HTML. The Next.js app stays at the repository root and owns accounts, audio, checkout, support submissions, APIs, and PWA behavior.

Use the repository's host toolchain: Node.js 24.22.0 or later and pnpm 12.14.0. Run commands from the repository root.

```bash
pnpm install --frozen-lockfile
pnpm website:dev
pnpm website:check
pnpm website:build
```

The output is `website/dist`. The website does not read the app's root `.env` or need database, storage, Stripe, or email credentials. Existing `.env` files and running servers must be preserved.

## Origins and indexing

Pass these values through the command's environment or your hosting build settings:

| Variable | Purpose |
| --- | --- |
| `SITE_URL` | Public marketing origin, such as the purchased main domain. |
| `PUBLIC_APP_URL` | Public app origin used for signup, login, pricing, support, and API links when the launch stage is `open`. |
| `SITE_LAUNCH_STAGE` | `coming-soon` (default) or `open`. Other values, including an explicitly empty value, fail the build. |
| `SITE_INDEXABLE` | `true` allows production indexing. Generic builds default to non-indexable; the production wrapper defaults to `true`, with an explicit `false` override. |

Unset origins use reserved `.example` addresses for local development. An indexable build rejects placeholder/local origins and requires separate public HTTPS website and app origins. Cloudflare Pages branch previews remain non-indexable even when the production environment enables indexing.

The managed production domains are committed in [`../deployment/production.json`](../deployment/production.json):

- Website: `https://getcallery.com`
- App: `https://app.getcallery.com`

Build the deployable website with that profile:

```bash
pnpm website:build:production
```

This command fixes canonical URLs, structured data, sitemap URLs, and future app links to the production domains. It defaults to an indexable `coming-soon` site and does not edit or load the app's root `.env` or change self-host defaults. Cloudflare branch previews stay non-indexable. The ordinary `website:build` command continues to accept generic development or self-host origins and does not enable indexing by default.

In `coming-soon`, the site displays a non-clickable **Launching soon** status instead of managed signup/login/purchase links. Demo, documentation, compatibility, and self-host links remain active. No waitlist form or email collection is enabled. Pricing says it will be announced, remains non-indexable, and is excluded from the sitemap even if a catalog exists. The 404 page is always excluded from the sitemap.

The launch homepage and reviewed guides can be indexed before managed app services and prices are ready. `open` builds restore app links and require a valid matching pricing snapshot before an indexable publication. Any present snapshot must match the app origin for an indexable build, and malformed snapshots fail in either stage.

For an isolated local website preview with links to the existing test app, pass its saved app origin without editing the app configuration:

```bash
PUBLIC_APP_URL=https://vosift.coarde.com pnpm website:dev
```

Do not change the shared app's `NEXT_PUBLIC_APP_URL` to a local preview address.

## Publish pricing

Opening the managed website requires a separately deployed app that implements the read-only `/api/public/pricing` export. That app endpoint is outside this static-site release. The current `coming-soon` site uses a null snapshot and needs no app API. After the managed export is deployed, synchronize its catalog before an `open` website release:

```bash
pnpm website:sync-pricing --from https://your-app-origin.example
pnpm website:check
pnpm website:build
```

Replace the example URL with the managed app origin. The command validates the response before replacing `src/data/pricing.json`. A failed response leaves the saved snapshot intact and fails the command. The exported data contains display prices, allowances, public usage rates, availability, source origin, and fetch time; it does not contain Stripe checkout identifiers.

The snapshot is intended to be reviewed and committed with website content. Builds read that saved file offline. Publishing new app prices does not update an already deployed static website: synchronize, review, and republish it. Checkout always opens the app's live pricing flow, which resolves current terms.

A missing snapshot is allowed for the `coming-soon` website. Indexable `open` builds require a valid managed snapshot matching the configured app origin. Coming-soon pages never expose saved prices or offers. Do not publish installation-default or test-fixture amounts as real offers.

For the managed production launch, publish the reviewed app pricing first, then synchronize its public snapshot:

```bash
pnpm website:sync-pricing --from https://app.getcallery.com
pnpm website:check
SITE_LAUNCH_STAGE=open pnpm website:build:production
```

Review and commit the resulting snapshot before setting `SITE_LAUNCH_STAGE=open` in production hosting settings. Open the managed stage only after production services and signup have passed acceptance checks. `SITE_INDEXABLE=false` can temporarily suppress production indexing without changing launch state.

## Add a device guide

Create a Markdown file in `src/content/guides/`; its filename becomes `/guides/<filename>`. Start with `draft: true` and copy the metadata structure from an existing guide.

Set `category: setup` for instructions about choosing a dialer or enabling call recording. These appear in the separate `/call-recording` hub. Set `category: import` for finding, copying, backing up, or uploading original recordings; these appear at `/guides`. Compatibility limitations use the same stable article routes but appear separately under unsupported workflows. Existing entries without a category default to `import`.

Record the manufacturer, device/model scope, region, OS and dialer version, task, access method, Callery upload formats, automatic metadata coverage, evidence URLs, and source-review date. Distinguish these three questions:

1. Can the device and dialer record calls in the stated region?
2. Can a person copy original files together from shared internal storage using a file manager, keeping filenames intact?
3. Can Callery upload the audio format and recognize the original filename’s caller and call date?

`access` is `files`, `share`, `varies`, `unavailable`, or `unverified`. `archiveWorkflow` is required: `folder-copy` for documented direct original-file access in the stated scope, `conditional` when device checks remain, or `unsupported` when the workflow does not meet the archive requirements. `folder-copy` requires `access: files`; `share` requires `archiveWorkflow: unsupported`. Unsupported articles get a compatibility next step rather than an import/signup prompt. An uploadable format alone never establishes archive compatibility.

`verification` is `verified`, `limited`, or `unverified`; limited means the guide has a stated scope, not universal brand support. The source-review date is not a claim of physical hardware testing. Include exact model and software details when hardware is tested.

The initial guides rely on maintained Callery documentation and scoped official phone instructions. Vivo/iQOO automatic filename recognition is unverified. Specific ColorOS patterns are recognized, but that does not certify all Oppo phones. Keep future guides as drafts until their evidence and instructions are ready. The content schema prevents an unverified guide from being published and requires a source-review date for verified or limited entries.

Google Phone/Pixel individual sharing is unsupported for the bulk archive. Keep the existing Google guide URL as a limitation explanation, not a sharing tutorial or supported-device recommendation. That describes the current recording setup, not permanent hardware incompatibility: some devices offer an OEM route. Do not claim every export has a random filename; the documented limitation is the absence of a supported original-folder workflow and a stable caller/date filename contract.

ADB instructions may use first-hand community reports when clearly labelled as community-reported and scoped to the reported model/build. Separate restored dialer behavior from recording, folder access, and verified Callery import. Include existing-package checks, captured prior state, staged commands, missing-package stop conditions, rollback, and normal-calling checks. Explain Google-app and overlay removals separately; do not imply that another region's firmware proves the current build contains a working OEM stack. An OEM switch does not migrate old Google Phone recordings.

Supported Callery uploads are MP3, WAV, M4A, MP4, and WebM. That list does not mean every phone exports every format. AMR, standalone AAC, and OGG/Opus are not supported uploads. A recognized filename does not add audio-format support.

The guide index, guide detail routes, and sitemap omit drafts. Never publish an empty manufacturer page just to target a keyword.

## Product screenshots and claims

The homepage and search explainer use four privacy-cleaned real-app PNGs committed in `src/assets/screenshots/`: `upload-queue.png`, `library-demo.png`, `search-delivery.png`, and `hero-transcript.png`. Astro produces responsive image assets from these sources. Website builds and isolated publication tests use these committed copies and do not require the local video package. Keep captions identifying the fictional demonstration data. The original hero illustration remains labelled as an illustration.

These stills originated in the product-introduction demo. Its application screenshots were cleaned to remove the operator portrait and sidebar footer before packaging. The three demonstration recordings use fictional audio generated with ElevenLabs. The hero transcript's eight segments are actual Gemini output; the three demo summaries were prepared editorially to match that audio. Do not present those summary shots as evidence of successful generated summaries. No demo audio or original private captures are included in the website assets. New captures must use synthetic data and be reviewed before publication. Do not add unverified language coverage, provider no-training guarantees, encryption-at-rest claims, or a mobile auto-sync commitment.

## Public documentation

`/docs` publishes the user guide, setup guides, transcription batches, integration API, MCP setup, API reference, recording filename reference, and release instructions directly from the repository's `docs/` Markdown. The explicit registry in `src/lib/documentation.ts` controls publication and navigation; internal engineering notes and operator runbooks remain in the repository.

Edit the original Markdown instead of copying it into the website. Published cross-links resolve to local documentation pages, while links to unpublished repository material resolve to GitHub. Code examples keep their literal contents. The website's build therefore needs the repository root as its source checkout, with `website/` as the package working directory.

## Deploy

For Cloudflare Pages, keep the full repository checkout available and use the repository root as the build root. Set the build command to `pnpm website:build:production` and the output directory to `website/dist`. Use Node.js 24.22.0 or later and pnpm 12.14.0. The committed profile supplies both public origins, so Pages does not need duplicate `SITE_URL` or `PUBLIC_APP_URL` settings. Use `SITE_LAUNCH_STAGE=coming-soon` and `SITE_INDEXABLE=true` for the current public launch. Attach `getcallery.com` as the Pages custom domain. The app's `app.getcallery.com` deployment is separate.

See [website deployment and domain cutover](../docs/website-deployment.md) for Cloudflare Pages settings, app link configuration, pricing publication, and origin migration.
