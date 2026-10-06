# Dependency review — 2026-10-05

This update continues the September 30 modernization after the branch reconciliation. Node 24 is the Docker/development baseline, pnpm 12.9.1 is pinned, and direct dependencies were checked against the registry's current stable releases.

Upgrades include Next.js 16.3.8, Better Auth 1.7.7, Serwist 9.5.13, Sentry 11.4, Stripe 23, Archiver 8, Motion 14, music-metadata 12, ESLint 10.12 and Vite 8.3.2. React 19.3 and Tailwind 4 remain current. The Google Contacts code uses `@googleapis/people` and `google-auth-library`; the unused local-auth package, duplicate `googleapis` SDK and legacy ESLint compatibility dependency were removed.

## Compatibility choices

- Node's type declarations stay on the latest Node **24** release line to match the actual runtime.
- The `typescript` alias supplies the latest JavaScript compiler API (`@typescript/typescript6`) required by Next.js and the lint parser. The `@typescript/native` alias supplies the stable TypeScript **7** command-line compiler. Both are intentional; replacing the API package with TypeScript 7 breaks tools that require `typescript/lib/typescript.js`.
- ESLint 10 uses the current TypeScript parser across JavaScript/TypeScript files because Next's bundled Babel parser lacks ESLint 10's `ScopeManager.addGlobals` method. `@eslint/compat` adapts React/import/accessibility rules that still use removed context methods. The three peer-version rules in `pnpm-workspace.yaml` apply specifically to those adapted plugins.
- Archiver 8 is ESM and exports `ZipArchive`; exports now use that class instead of the removed default factory. ZIP regression checks cover binary audio, Unicode paths and transcript data.
- On Windows, Next's standalone tracer copies pnpm 12 relative directory links as file links, which fail at runtime with `EPERM`. The postbuild preparation recreates those with the correct directory type, preserving relative targets after verifying both link and target stay inside `.next/standalone`. It modifies generated links only and is skipped on Linux/macOS.
- Next bundles the S3 client and request presigner through `transpilePackages`. Without this setting, standalone tracing omits a dependency link for the current SDK's checksum subpath and direct uploads fail with `MODULE_NOT_FOUND`, despite a successful build.
- Stripe 23 uses its current default API version, `2026-09-30.endive`. Billing operators must configure their webhook endpoint to match the SDK version. No live Stripe account or payment was changed in this upgrade.
- The existing `cf` and Cloudflare Vite plugin beta pins are retained together for `cloudflare.config.ts`. They are the experimental runtime, while Docker/Node remains the launch target. Installing the older stable Vite plugin in place of this beta would change the configuration contract.

## Security fixes

Auth unification removes both identity SDK packages and their transitive build
allowances. The current audit also requires `source-map-js` 1.2.2, selected with
a narrow override for older versions; see the
[maintainer release](https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2).

The initial audit had seven findings: two Browserslist findings, two gRPC findings, UUID, fflate and braces. Serwist's update resolves Browserslist. Narrow overrides select patched UUID 11, fflate 0.7.5 and gRPC 1.14 versions for SDKs that still request vulnerable dependencies. UUID 11 preserves CommonJS compatibility for gaxios 6.

`braces` has no published patched release for [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). `patches/braces@3.0.3.patch` bounds parser nesting to 100 and checks supplied ASTs before recursive compilation, expansion or stringification. It covers parentheses as well as braces and rejects cyclic/deep ASTs. Ordinary patterns and escaped/quoted literal braces continue to work. Tests reproduce the reported 4,000-level input and verify normal expansions.

Registry audits and Dependabot can still report **one high-severity braces alert** because they identify the upstream package version rather than the patched source. This alert is not dismissed or hidden in pnpm's ignore configuration. `pnpm run audit` checks every reported installed dependency path and verifies the exact patched source hashes before recognizing this one advisory as locally remediated. A missing/changed patch, a different version/advisory, registry errors and any other finding fail the check. Replace the local patch with an upstream fixed version when one is available.

## Verification commands

Use `corepack pnpm` when the globally installed pnpm is older than the version pinned here.

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm check
corepack pnpm run audit:prod
corepack pnpm peers check
corepack pnpm build
corepack pnpm build:vinext
```

`pnpm run audit` is the verified-patch gate; bare `pnpm audit` is the raw registry scan and still reports the braces finding. Neither check relies on an npm lockfile or the old blanket low-severity allowance.

Runtime verification uses disposable MongoDB and storage/provider fixtures. Live Google OAuth, Stripe, SMTP and a deployed Worker require operator credentials; Docker container startup also requires Docker Engine. Those are separate from local package/build checks.

## Verified results

- Frozen lockfile installation and peer dependency validation passed. The only registry `outdated` entry is the intentional Node 24 type declaration hold.
- Type checking and full-repository ESLint 10 passed.
- All 92 application tests passed against disposable MongoDB, with no skipped tests. All five dependency/ZIP/Windows standalone regression tests passed.
- Before auth unification, production Node builds passed for the former auth modes with billing off/on, including service-worker and manifest verification. The experimental Cloudflare build also passed.
- All five Playwright browser tests passed against the production standalone app, including signup, upload, support and workspace navigation.
- Isolated API checks passed for cookie/bearer auth, admin bootstrap, sync tokens, direct upload and duplicate completion, ownership, playback ranges, search/date filters, billing off, transcription/AI accounting and disabled-session/signup enforcement.
- Full and production audit gates passed with the exact braces patch verified. The raw registry scan retains its one version-based braces finding.

Docker Engine and live provider credentials were unavailable for this verification. The Cloudflare build's existing bundler/runtime warnings remain, so a successful bundle does not promote that runtime out of experimental status.
