# Dependency review

The dependency baseline was updated on 2026-10-18. The 2026-11-01 cleanup removes obsolete local patches and unused overrides without upgrading the locked packages.

Node 24.22.0 LTS is the Docker/development baseline and pnpm 12.14.0 is pinned. Direct dependencies were checked against the registry's stable releases during the October 18 update. The host already had both tools installed; project commands used the user's fnm Node 24 executable. The global fnm default was not changed. Run `fnm use` in this checkout to select `.nvmrc` in an existing terminal.

The October 18 update refreshed 33 direct packages and the Cloudflare Vite beta pin. Key versions are Next.js/eslint-config-next 16.4.2, React/React DOM/React Server DOM Webpack 19.3.1, Better Auth and its Mongo adapter 1.7.10, Sentry 11.8.0, vinext 1.2.1, its Cloudflare adapter 1.1.1, Vite 8.3.4 and the RSC plugin 0.5.38. Other baseline packages, including Serwist 9.5.13 and the intentional TypeScript aliases, are retained.

## Compatibility choices

- The independent `website/` workspace uses Astro 7.4.11, `@astrojs/check` 0.9.12, `@astrojs/sitemap` 3.7.4, and locally served Manrope 5.3.0. It shares the pinned pnpm lockfile and the intentional TypeScript compiler API alias; its checks are separate from the Next.js app. App typechecking excludes the website, and the Docker dependency stage includes both workspace manifests.

- Node's type declarations stay on the Node **24** release line (24.19.2) to match the selected runtime, rather than following a registry tag targeting a different Node major.
- The `typescript` alias supplies the JavaScript compiler API (`@typescript/typescript6`) required by Next.js and the lint parser. The `@typescript/native` alias supplies the TypeScript **7** command-line compiler. Both are intentional; replacing the API package with TypeScript 7 breaks tools that require `typescript/lib/typescript.js`.
- ESLint 10 uses the current TypeScript parser across JavaScript/TypeScript files because Next's bundled Babel parser lacks ESLint 10's `ScopeManager.addGlobals` method. `@eslint/compat` adapts React/import/accessibility rules that still use removed context methods. The three peer-version rules in `pnpm-workspace.yaml` apply specifically to those adapted plugins.
- Archiver 8 is ESM and exports `ZipArchive`; exports now use that class instead of the removed default factory. ZIP regression checks cover binary audio, Unicode paths and transcript data.
- On Windows, Next's standalone tracer copies pnpm 12 relative directory links as file links, which fail at runtime with `EPERM`. The postbuild preparation recreates those with the correct directory type, preserving relative targets after verifying both link and target stay inside `.next/standalone`. It modifies generated links only and is skipped on Linux/macOS.
- Next bundles the S3 client and request presigner through `transpilePackages`. Without this setting, standalone tracing omits a dependency link for the current SDK's checksum subpath and direct uploads fail with `MODULE_NOT_FOUND`, despite a successful build.
- Stripe 23 uses its current default API version, `2026-09-30.endive`. Billing operators must configure their webhook endpoint to match the SDK version. No live Stripe account or payment was changed in this upgrade.
- `cf` 1.0.0-beta.18 and the Cloudflare Vite plugin 2.0.0-beta.v.1 are pinned together for `cloudflare.config.ts`. Both resolve the same Miniflare/runtime configuration packages. Installing the older stable Vite plugin in place of this beta would change the configuration contract. Docker/Node remains the launch target.
- The Google SDK's transitive `googleapis-common` was refreshed to 9.3.1 so it shares google-auth-library 11.3.1 with the app. Leaving its old lockfile entry produced incompatible OAuth client types from duplicate library versions; no type casts or application API changes were needed.
- The Vite build embeds the existing brand PNG as the social-image module's data URL. Workers do not have a `public/` filesystem directory; the previous eager read prevented every dynamic route from starting. The Node implementation and source PNG are unchanged.
- The test command quotes its file glob so Node discovers nested suites. Its setup selects the server condition only for the `server-only` marker, while preserving normal React exports elsewhere.
- Browser fixtures load production action IDs from the build manifest, serve mock audio through the same origin to respect CSP, and wait for logout navigation. Their selectors follow the current headings, breadcrumbs and filename disclosure; product behavior and CSP are preserved.

## Security fixes

Auth unification removes both identity SDK packages and their transitive build
allowances. The current audit also requires `source-map-js` 1.2.2, selected with
a narrow override for older versions; see the
[maintainer release](https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2).

The old Cloudflare tooling selected sharp 0.35.4, affected by [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w). The coordinated Cloudflare update selects Miniflare 5.20261012.1-beta and sharp 0.35.5, resolving this finding without another override.

The current graph retains narrow overrides for fflate 0.7.5, source-map-js 1.2.2, and fast-uri 3.1.9. The fast-uri override removes the affected transitive version shared by existing app tooling and Astro's content checker. The former UUID/gaxios 6 and gRPC overrides no longer match any locked package and have been removed.

GitHub withdrew [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) on 2026-10-23 because it is not a practically exploitable vulnerability. There is no newer upstream `braces` release containing our optional depth guards. The cleanup removes that local hardening patch and the audit's special source-hash exception; all registry findings now fail the audit normally.

The `tr46` patch, punycode aliases and direct development-only punycode dependency are also removed. Upstream tr46 still uses `require("punycode/")`; this is not an upstream tr46 fix. Isolated tests of the current vinext/Vite/workerd stack loaded the actual MongoDB dependency graph and converted ASCII/Unicode domains successfully with pristine tr46, both with and without aliases. Full isolated builds and runtime smoke checks remain necessary when changing this compatibility boundary. Punycode remains installed transitively where URL parsers require it.

## Verification commands

Use the host-installed pnpm with the version pinned here. pnpm 12 selects the project's pinned version automatically; `pnpm --version` in this checkout should print 12.14.0.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm run audit:prod
pnpm peers check
pnpm build
pnpm build:vinext
```

`pnpm run audit` and `pnpm run audit:prod` validate the registry response and fail on every reported advisory. They contain no patch exceptions or severity allowances. Bare `pnpm audit` exposes the raw registry scan.

The 2026-11-12 website split resolves the four fast-uri findings with the narrow override above. A full registry audit still reports 15 pre-existing findings affecting zod, undici, nodemailer, qs, minimatch, and glob; none of the remaining advisory paths belong to the website workspace. The audit remains failing until those dependencies are remediated and verified; the historical green results below do not certify the current graph.

Runtime verification uses a source copy without deployment `.env` files, disposable MongoDB and a memory-only S3 fixture on separate loopback ports. Integration suites use process-only `VOSIFT_TEST_MONGODB_URI`, `VOSIFT_TEST_STORAGE_ENDPOINT`, `VOSIFT_TEST_API_BASE_URL` and `VOSIFT_TEST_API_MONGODB_URI` settings. Browser tests use `TEST_BASE_URL` and `TEST_ACTION_MANIFEST_PATH` for that production build. Live Google OAuth, Stripe, SMTP and a deployed Worker require separate verification; Docker container startup also requires Docker Engine.

## Website split verification — 2026-11-12

- Astro checks and six pricing/publication tests pass. The static output contains 15 pages, valid JSON-LD, sitemap/robots rules, and 390 checked internal links and assets. An unpublished Vivo fixture stays out of routes and the sitemap; indexable builds require matching real pricing. Desktop and 360px mobile browser review passed.
- App lint, unit tests, dependency/release/runtime checks, and peer validation pass. Isolated self-hosted Next.js, managed Next.js, and vinext builds pass; Next builds also pass PWA verification. Twenty production HTTP assertions cover redirects, query values, indexing, developer/support pages, legal fallbacks, and unavailable pricing.
- A clean frozen-lockfile installation with the Docker dependency-stage manifest set passes. Docker Engine is unavailable, so full container acceptance was not run. No deployment environment files or user-owned processes were changed.
- The full registry audit still fails on the 15 pre-existing findings documented above. No advisory exceptions were added, and no remaining advisory path belongs to the website workspace.

## Verification — 2026-11-03

- Checks used the installed host Node 24.22.0 and pinned pnpm 12.14.0. Typechecking, full-repository ESLint and peer validation passed.
- Application tests passed 891 checks; 31 optional service-dependent checks were skipped. Two dependency checks, twelve release checks and three runtime checks passed; the Windows-only dependency check was skipped.
- All eight export retry browser checks passed at the saved public HTTPS origin using intercepted application fixtures. These checks verify the settings and company-archive retry flows without certifying live provider behavior.
- Isolated production builds passed for self-hosted Next.js, managed Next.js and vinext, without deployment environment files or changes to the shared development server. Both Next.js builds also passed standalone preparation and PWA checks.
- The full audit still reports 19 unresolved findings: five high, twelve moderate and two low. The production audit reports eleven: one high, eight moderate and two low. Both audit gates fail; consequently `pnpm check` remains failing at its audit step despite the passing checks above. No advisory exceptions were added.
- The Dockerfile no longer copies the deleted local patch directory, which would fail in a fresh checkout. The documentation-only final MP4 is excluded from the Docker build context. Docker container startup was not rerun because Docker Engine is unavailable.

## Cleanup verification — 2026-11-01

- A fresh frozen-lockfile installation in an isolated workspace contains pristine braces 3.0.3 and tr46 5.1.1. No package versions were upgraded and the shared deployment's installed dependencies were left untouched.
- Types, lint, 841 application tests, two dependency tests, twelve release checks and three runtime checks passed. Thirty-one optional service-dependent application checks and the Windows-only dependency check were skipped. The current registry audit fails on the nineteen findings listed above.
- Isolated production builds passed for managed Next.js, self-hosted Next.js and vinext, with no saved deployment environment files.
- Both Node standalone builds served the retained logo, all manifest icons and screenshots, favicon, both social images and public auth capabilities. Real Chromium checks verified the login form's styling and layout at 390px and 1280px after removing the unused Tailwind configuration. Database health returned the expected 503 against the unavailable loopback fixture.
- The unpatched vinext production preview served login, the retained logo, every retained icon, the manifest, both social images and auth capabilities successfully. Health returned the expected 503 against an intentionally unavailable loopback database; the actual MongoDB driver loaded without punycode/import failures. Profile initialization also needs a database, so this fixture does not certify authenticated Workers flows. No production services, provider APIs or application database were used.

## Historical verification — 2026-10-18

- Frozen lockfile installation, peer validation, typechecking and full-repository ESLint passed. The only registry `outdated` entry is the intentional Node 24 type declaration hold.
- `pnpm check` passed all 218 application tests with no skips, including the running HTTP API and network S3 suites. Four dependency/ZIP regression tests passed; the Windows-only standalone test was skipped on Linux.
- The production Next.js build, standalone server startup, database health and all service-worker/manifest checks passed with billing disabled. The standalone output was built with its own dependency installation, avoiding links outside its tracing root.
- Browser validation covered 156 cases. After fixture corrections and targeted reruns, 148 passed, seven managed-only cases were skipped for the self-host profile, and one intermittent keyboard-focus restoration failure remains. Real signup, login/logout, upload, original-filename disclosure and workspace navigation passed. The remaining case reproduces React Aria restoring focus to another table row after the app restores the caller; the modal implementation was left unchanged.
- The experimental Cloudflare build passed, followed by typechecking. Local workerd preview serves login, static assets and both social images. With fixture bindings, database health passes, anonymous profile requests return 401 and invalid sign-in returns 401. Signup and public system-settings requests are canceled by workerd as hung; authenticated Workers operation remains unverified.
- Full and production audit gates passed under the then-current local braces patch. That advisory was subsequently withdrawn and the patch exception has been removed.

Docker Engine was unavailable, and no live providers or deployed Worker were exercised. Cloudflare preview fixture values were applied only to the generated configuration in the temporary workspace. The source Worker configuration still requires operator binding declarations and secret values before deployment. Existing bundler warnings, PWA differences and the observed request cancellation keep Workers experimental; see [Cloudflare verification boundaries](cloudflare-workers.md).
