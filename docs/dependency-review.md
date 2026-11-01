# Dependency review — 2026-10-18

Node 24.22.0 LTS is the Docker/development baseline, pnpm 12.14.0 is pinned, and direct dependencies were checked against the registry's current stable releases. The host already had both installed; project commands were run with the user's fnm Node 24 executable. The global fnm default was not changed. Run `fnm use` in this checkout to select `.nvmrc` in an existing terminal.

This update refreshes 33 direct packages and the Cloudflare Vite beta pin. Key versions are Next.js/eslint-config-next 16.4.2, React/React DOM/React Server DOM Webpack 19.3.1, Better Auth and its Mongo adapter 1.7.10, Sentry 11.8.0, vinext 1.2.1, its Cloudflare adapter 1.1.1, Vite 8.3.4 and the RSC plugin 0.5.38. Other current packages, including Serwist 9.5.13 and the intentional TypeScript aliases, are retained.

## Compatibility choices

- Node's type declarations stay on the latest Node **24** release line (24.19.2) to match the selected runtime. This is the only expected `pnpm outdated` entry, since the registry's latest tag targets Node 26.
- The `typescript` alias supplies the latest JavaScript compiler API (`@typescript/typescript6`) required by Next.js and the lint parser. The `@typescript/native` alias supplies the stable TypeScript **7** command-line compiler. Both are intentional; replacing the API package with TypeScript 7 breaks tools that require `typescript/lib/typescript.js`.
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

The initial audit had seven findings: two Browserslist findings, two gRPC findings, UUID, fflate and braces. Serwist's update resolves Browserslist. Narrow overrides select patched UUID 11, fflate 0.7.5 and gRPC 1.14 versions for SDKs that still request vulnerable dependencies. UUID 11 preserves CommonJS compatibility for gaxios 6.

`braces` has no published patched release for [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). `patches/braces@3.0.3.patch` bounds parser nesting to 100 and checks supplied ASTs before recursive compilation, expansion or stringification. It covers parentheses as well as braces and rejects cyclic/deep ASTs. Ordinary patterns and escaped/quoted literal braces continue to work. Tests reproduce the reported 4,000-level input and verify normal expansions.

Registry audits and Dependabot can still report **one high-severity braces alert** because they identify the upstream package version rather than the patched source. This alert is not dismissed or hidden in pnpm's ignore configuration. `pnpm run audit` checks every reported installed dependency path and verifies the exact patched source hashes before recognizing this one advisory as locally remediated. A missing/changed patch, a different version/advisory, registry errors and any other finding fail the check. Replace the local patch with an upstream fixed version when one is available.

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

`pnpm run audit` is the verified-patch gate; bare `pnpm audit` is the raw registry scan and still reports the braces finding. Neither check relies on an npm lockfile or the old blanket low-severity allowance.

Runtime verification uses a source copy without deployment `.env` files, disposable MongoDB and a memory-only S3 fixture on separate loopback ports. Integration suites use process-only `VOSIFT_TEST_MONGODB_URI`, `VOSIFT_TEST_STORAGE_ENDPOINT`, `VOSIFT_TEST_API_BASE_URL` and `VOSIFT_TEST_API_MONGODB_URI` settings. Browser tests use `TEST_BASE_URL` and `TEST_ACTION_MANIFEST_PATH` for that production build. Live Google OAuth, Stripe, SMTP and a deployed Worker require separate verification; Docker container startup also requires Docker Engine.

## Verified results

- Frozen lockfile installation, peer validation, typechecking and full-repository ESLint passed. The only registry `outdated` entry is the intentional Node 24 type declaration hold.
- `pnpm check` passed all 218 application tests with no skips, including the running HTTP API and network S3 suites. Four dependency/ZIP regression tests passed; the Windows-only standalone test was skipped on Linux.
- The production Next.js build, standalone server startup, database health and all service-worker/manifest checks passed with billing disabled. The standalone output was built with its own dependency installation, avoiding links outside its tracing root.
- Browser validation covered 156 cases. After fixture corrections and targeted reruns, 148 passed, seven managed-only cases were skipped for the self-host profile, and one intermittent keyboard-focus restoration failure remains. Real signup, login/logout, upload, original-filename disclosure and workspace navigation passed. The remaining case reproduces React Aria restoring focus to another table row after the app restores the caller; the modal implementation was left unchanged.
- The experimental Cloudflare build passed, followed by typechecking. Local workerd preview serves login, static assets and both social images. With fixture bindings, database health passes, anonymous profile requests return 401 and invalid sign-in returns 401. Signup and public system-settings requests are canceled by workerd as hung; authenticated Workers operation remains unverified.
- Full and production audit gates passed with the exact braces patch verified. The raw registry scan retains its one version-based braces finding.

Docker Engine was unavailable, and no live providers or deployed Worker were exercised. Cloudflare preview fixture values were applied only to the generated configuration in the temporary workspace. The source Worker configuration still requires operator binding declarations and secret values before deployment. Existing bundler warnings, PWA differences and the observed request cancellation keep Workers experimental; see [Cloudflare verification boundaries](cloudflare-workers.md).
