# Next.js 16 Standards Audit Report

- Project: `call-memo` (`vosift`)
- Audit date: 2026-03-11
- Auditor: Codex (GPT-5)
- Framework baseline: `next@16.1.4`, `react@19.2.0`, `react-dom@19.2.0`

## Executive Summary

The application is broadly aligned with Next.js 16 App Router standards and passed all core quality gates:

- `eslint` passed
- `tsc --noEmit` passed
- `next build --webpack` passed

I found **2 actionable standards/risk issues** and **1 low-priority optimization**, plus applied **1 direct fix** during this audit.

## Standards sources (official)

- [Upgrade to Next.js 16](https://nextjs.org/docs/app/guides/upgrading/version-16)
- [page.js file convention (async `params`/`searchParams`)](https://nextjs.org/docs/app/api-reference/file-conventions/page)
- [route.js file convention (async `context.params`)](https://nextjs.org/docs/app/api-reference/file-conventions/route)
- [cookies() async API](https://nextjs.org/docs/app/api-reference/functions/cookies)
- [Route Segment Config](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config)
- [serverActions config](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions)
- [proxyClientMaxBodySize config](https://nextjs.org/docs/app/api-reference/config/next-config-js/proxyClientMaxBodySize)
- [Cache Components](https://nextjs.org/docs/app/getting-started/cache-components)

## Static + runtime checks run

- Project config review (`package.json`, `next.config.ts`, `tsconfig.json`, ESLint config)
- Route and API surface review (`src/app/**`)
- Dynamic API migration checks (`cookies`, `params`, `searchParams`)
- Dev runtime diagnostics via Next.js MCP (`get_routes`, `get_errors`, `get_logs`)
- Browser validation on key routes (`/`, `/login`, `/signup`, `/recordings`, `/admin`)
- Build pipeline verification (`npm run build`)

## Findings (Prioritized)

## 1) High: Request body limits are set far above safe defaults

- Evidence: [`next.config.ts`](/Users/virusz4274/development/call-memo/next.config.ts:11) and [`next.config.ts`](/Users/virusz4274/development/call-memo/next.config.ts:13)
- Current values:
  - `experimental.serverActions.bodySizeLimit = '2000mb'`
  - `experimental.proxyClientMaxBodySize = '2000mb'`

Why this matters:

- Next.js documents a 1MB default for Server Actions body parsing specifically to reduce abuse/resource risk.
- `proxyClientMaxBodySize` is experimental and documented with a 10MB default buffering cap; very large values can amplify memory pressure under load.

Recommendation:

- Reduce limits to the minimum needed by real payload sizes (for example `5mb` to `20mb` depending on upload design).
- For large binaries, upload directly to object storage and submit metadata through actions/routes.

## 2) Medium: Global layout makes DB-dependent calls on public routes, producing runtime errors when DB is unavailable

- Evidence:
  - [`src/components/app-layout.tsx`](/Users/virusz4274/development/call-memo/src/components/app-layout.tsx:45)
  - [`src/components/announcement-banner.tsx`](/Users/virusz4274/development/call-memo/src/components/announcement-banner.tsx:16)
  - Runtime MCP `get_errors` consistently reported console errors on public pages when Mongo DNS timed out.
  - Next dev log: [`/.next/dev/logs/next-development.log`](/Users/virusz4274/development/call-memo/.next/dev/logs/next-development.log) showing `querySrv ETIMEOUT`.

Why this matters:

- Public pages (`/login`, `/signup`, `/recordings` unauthenticated) emit runtime console errors and issue-overlay noise when infra is degraded.
- This reduces signal quality in debugging and can mask real client/runtime regressions.

Recommendation:

- Treat these calls as optional telemetry/config reads on public pages.
- Avoid `console.error` for expected fallback paths; degrade silently or with `console.warn`.
- Consider cached route handlers (or static bootstrap config) for maintenance flags/announcements.

## 3) Low: Redundant `--turbopack` in dev script on Next.js 16

- Evidence: [`package.json`](/Users/virusz4274/development/call-memo/package.json:7)

Why this matters:

- In Next.js 16, Turbopack is already default for `next dev` and `next build` unless opted out.
- This is not breaking, but it is unnecessary config noise.

Recommendation:

- Optional cleanup: change `next dev --turbopack -p 9000` to `next dev -p 9000`.

## Applied Fix During Audit

I applied one standards-alignment fix to avoid swallowing/printing dynamic API control-flow during build-time rendering:

- Updated [`src/lib/auth-utils.ts`](/Users/virusz4274/development/call-memo/src/lib/auth-utils.ts:43)
- Change: moved `await cookies()` outside the broad `try/catch` in `getFirebaseUidFromSession()` so only session verification errors are caught.

Outcome:

- Re-ran `next build --webpack`; build completed successfully and the prior dynamic-server warning log for `/` was no longer emitted.

## Compliance Snapshot

- Next.js/React versions are aligned with v16 expectations: ✅
- App Router conventions in use (`src/app`): ✅
- Async Request APIs migration (`cookies`, `params`, `searchParams`): ✅
- Route handler dynamic params as `Promise`: ✅
- Deprecated `next lint` usage removed (ESLint CLI used): ✅
- Deprecated runtime config (`serverRuntimeConfig/publicRuntimeConfig`) absent: ✅
- Standards risk: oversized action/proxy body limits: ⚠️
- Runtime resiliency on public pages under DB outage: ⚠️
- Cache Components adoption (`cacheComponents: true`): not enabled (optional): ℹ️

## Verification Results

- `npm run lint`: pass
- `npm run typecheck`: pass
- `npm run build`: pass
- Next.js MCP route discovery: pass (`/`, admin routes, API routes, dynamic route segments detected correctly)
- Next.js MCP runtime errors: reproducible only for DB-connectivity-dependent calls on public pages

## Suggested Remediation Order

1. Reduce body size limits in `next.config.ts` to operationally justified values.
2. Harden public-route startup fetches to avoid error-level noise on expected fallback paths.
3. Optional cleanup of redundant `--turbopack` dev flag.
4. Optional strategic evaluation of `cacheComponents` adoption for future Next.js 16 rendering/caching model alignment.
