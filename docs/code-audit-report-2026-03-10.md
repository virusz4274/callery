# Call Memo Code Audit Report

Date: 2026-03-10
Auditor: Codex
Scope: Full repository static audit + build/lint/type checks + targeted business-logic review

## 1) Executive Summary

The project builds successfully, but it is **not production-ready** due to multiple high-risk issues:

- Critical security gaps in admin data access and secret management.
- Broken user flows (pricing checkout, file-browser detail endpoint, search behavior).
- Inconsistent billing/transcription accounting across async webhook paths.
- Incomplete business logic in export and support flows.
- Lint is failing in `src` and also polluted by generated build artifacts.

## 2) Verification Performed

Commands run:

- `npm run typecheck` -> **PASS**
- `npm run build` -> **PASS**
- `npm run lint` -> **FAIL** (28 errors, 23 warnings; many from generated folders)
- `npx eslint src --max-warnings=0` -> **FAIL** (10 errors, 14 warnings in source)

Additional checks:

- Route inventory under `src/app/api`
- Placeholder/TODO/stub scan
- Manual review of auth, admin, billing, transcription, export, notifications, contacts, and file-browser paths

## 3) Findings (Prioritized)

## Critical

### C1. Admin authorization is client-side only; server-side reads are unprotected
- Evidence:
  - `src/app/admin/layout.tsx:23-33` (redirect logic is client-only)
  - `src/app/actions/admin/stats.ts:9`
  - `src/app/actions/admin/users.ts:14,64`
  - `src/app/actions/admin/recordings.ts:11,44`
  - `src/app/actions/audit-log.ts:57`
  - `src/app/actions/admin-plans.ts:28,34`
  - `src/app/actions/admin-announcements.ts:27`
- Impact:
  - Admin datasets can be fetched without server-side admin validation if routes/actions are reached.
  - Possible exposure of user PII, billing metadata, and audit records.
- Recommended fix:
  - Enforce `getCurrentAdmin()` checks in **all** admin read actions and admin pages before querying data.
  - Treat client-side guards as UX only, never as security controls.

### C2. Secrets are committed to git (`.env`, `service-account.json`)
- Evidence:
  - `git ls-files` includes `.env` and `service-account.json`
  - `.gitignore` currently comments these out (`.gitignore:20-21`)
- Impact:
  - Direct credential/key leakage risk.
  - Compromise risk for Firebase and other services.
- Recommended fix:
  - Rotate all exposed secrets immediately.
  - Remove secret files from git history.
  - Reinstate ignore rules for `.env*` and `service-account.json`.

## High

### H1. Pricing checkout flow is broken on pricing page
- Evidence:
  - `src/components/pricing-section.tsx:27-30` sends `planName`, `successUrl`, `cancelUrl`
  - `src/app/api/stripe/checkout/route.ts:18-22` requires `priceId`
  - API reads `returnUrl`, not `successUrl/cancelUrl` (`route.ts:53-54`)
- Impact:
  - Users cannot subscribe from `/pricing` flow; checkout fails with 400.
- Recommended fix:
  - Pass `priceId` consistently.
  - Align request schema between client and API (`returnUrl` vs `successUrl/cancelUrl`).

### H2. File Browser requests a missing endpoint
- Evidence:
  - `src/components/pages/file-browser-page.tsx:74` calls `/api/recordings/${recordingId}`
  - No `src/app/api/recordings/*` route exists.
- Impact:
  - "View details" in file browser fails at runtime.
- Recommended fix:
  - Implement `GET /api/recordings/[id]` with auth + ownership checks, or switch to existing server action.

### H3. Manual transcription can leave stuck `processing` status on limit failure
- Evidence:
  - `src/app/actions/transcription.ts:60` sets `transcriptionStatus: 'processing'`
  - Access check happens after (`:64-67`) and may return early
- Impact:
  - Recording status can be incorrect (`processing` forever) despite rejection.
- Recommended fix:
  - Perform access checks before status mutation, or revert status when blocked.

### H4. Async transcription accounting is inconsistent between providers
- Evidence:
  - Soniox webhook increments usage + reports + notifies (`src/app/api/webhooks/soniox/route.ts:144-159`)
  - ElevenLabs webhook reports usage only; no local usage increment and no user notification (`src/app/api/webhooks/elevenlabs/route.ts:118-128`)
- Impact:
  - Quota counters drift from actual usage for ElevenLabs async jobs.
  - UX inconsistency (missing completion notifications).
- Recommended fix:
  - Align webhook post-processing across providers (usage increment, notifications, cleanup policies).

### H5. Google OAuth state is generated but not validated
- Evidence:
  - State generated in `src/app/actions/google-auth.ts:26`
  - Callback just forwards `state` (`src/app/api/auth/google/callback/route.ts:29-31`)
  - No server-side state verification before token exchange.
- Impact:
  - CSRF/session-mixup vulnerability in OAuth flow.
- Recommended fix:
  - Persist generated state in secure cookie/session and verify in callback before processing code.

### H6. `POST /api/user/ensure-profile` trusts client identity data without auth
- Evidence:
  - `src/app/api/user/ensure-profile/route.ts:10-37` accepts `firebaseUid` and `email` from body directly.
- Impact:
  - Unauthorized profile creation/modification attempts possible by forged payloads.
- Recommended fix:
  - Require verified Firebase token/session and derive UID from token, not request body.

### H7. Share-token secret falls back to hardcoded dev value
- Evidence:
  - `src/lib/sharing.ts:3` default `'dev-secret-key-change-in-prod'`
- Impact:
  - If env is misconfigured in production, share tokens become forgeable/predictable.
- Recommended fix:
  - Fail fast on missing secret in non-dev environments.

### H8. Search box (`q`) is effectively a no-op in recordings listing
- Evidence:
  - UI passes `search` (`src/components/pages/recordings-page.tsx:43,51-61`)
  - Schema ignores `search` (`src/lib/schemas.ts:3-14`)
- Impact:
  - Users type search text but listing query does not filter by it.
- Recommended fix:
  - Add validated `search` field and implement text filter in DB query.

## Medium

### M1. Stripe webhook sends "Subscription Cancelled" notification for non-cancel events
- Evidence:
  - Single case block includes `created`, `updated`, `deleted` and always sends cancellation message (`src/app/api/stripe/webhook/route.ts:46-63`)
- Impact:
  - Incorrect user messaging and alert fatigue.
- Recommended fix:
  - Branch notification logic by event type/status.

### M2. Google callback route can return no response when `code` missing
- Evidence:
  - `src/app/api/auth/google/callback/route.ts:11-41` has paths without final return.
- Impact:
  - Runtime route handler errors on malformed callback requests.
- Recommended fix:
  - Add explicit fallback redirect/400 response.

### M3. Login API leaks stack traces to clients
- Evidence:
  - `src/app/api/auth/login/route.ts:67-71` returns `stack` in JSON.
- Impact:
  - Internal implementation details exposed to end users/attackers.
- Recommended fix:
  - Return sanitized error messages only.

### M4. Lint setup includes generated/build artifacts, creating noisy failures
- Evidence:
  - `eslint.config.mjs` ignores `.next` but not `.open-next` and Android build paths.
  - Lint errors include `.open-next/**` and `android/app/build/**`.
- Impact:
  - CI/developer signal degraded; real source issues harder to prioritize.
- Recommended fix:
  - Extend ignore list to generated folders (`.open-next`, `android/app/build`, etc.).

### M5. `window` accessed during render path in a client component
- Evidence:
  - `src/components/pages/settings-page.tsx:104` uses `window.innerWidth` in JSX expression.
- Impact:
  - SSR/hydration instability risk (`window` unavailable on server render path).
- Recommended fix:
  - Move viewport checks to state/effect or use CSS/media-query-driven rendering.

### M6. Export background execution is not reliable in serverless runtime
- Evidence:
  - `src/app/actions/export.ts:30-34` uses `setTimeout` detached job with explicit comment that it may be killed.
- Impact:
  - Exports may silently fail/never complete in production serverless environments.
- Recommended fix:
  - Use durable background jobs/queues (Inngest, queue worker, cron + job table).

### M7. Export pipeline has explicit incompleteness and scaling risk
- Evidence:
  - `src/lib/export-processor.ts:31` TODO for large libraries.
  - Multiple comments acknowledge ad-hoc stream/upload assumptions.
- Impact:
  - Large exports can fail or degrade under real load.
- Recommended fix:
  - Implement paginated fetch + resilient chunked upload + retry/idempotency strategy.

### M8. Support page form is present but not wired to any backend
- Evidence:
  - `src/app/support/page.tsx:67-91` has form fields but no submit handler/integration.
- Impact:
  - User submissions are dropped; support UX is misleading.
- Recommended fix:
  - Add validated submit action + email/ticket integration + success/error UI.

### M9. File page auth-pending check has string mismatch
- Evidence:
  - Error set to `'Authentication pending'` (`src/app/files/page.tsx:31,40`)
  - Check compares `'Authentication pending...'` (`:112`)
- Impact:
  - Premature error UI despite retry flow.
- Recommended fix:
  - Normalize sentinel value or replace with typed enum/state.

### M10. Web Push server module hard-requires VAPID keys at import time
- Evidence:
  - `src/lib/web-push.ts:4-8` uses non-null env assertions in top-level init.
- Impact:
  - Potential module-load crash in environments missing VAPID keys.
- Recommended fix:
  - Lazy-init with guarded checks and explicit feature-disable behavior.

## Low

### L1. Source lint errors in `src` should be resolved before shipping
- Evidence:
  - `npx eslint src --max-warnings=0` reports 10 errors.
  - Key files: `notification-center.tsx`, `client-only.tsx`, `client-formatted-date.tsx`, `theme-switcher.tsx`, `app-layout.tsx`, `support/page.tsx`.
- Impact:
  - Lower code quality and higher regression risk.
- Recommended fix:
  - Fix reported hooks/JSX issues and remove stale eslint-disable directives.

### L2. Placeholder/mock business sections remain in admin user detail
- Evidence:
  - Mock invoices in `src/app/admin/users/[id]/page.tsx:25-26`
- Impact:
  - Incomplete admin billing visibility.
- Recommended fix:
  - Integrate Stripe invoice fetch and render real records.

## 4) Missing Test Coverage

No meaningful automated test suite was found for critical business flows (auth, billing, transcription webhooks, exports, admin access control). This significantly raises release risk.

Recommended minimum:

1. Integration tests for auth/session + protected routes/actions.
2. End-to-end tests for pricing checkout, upload, transcription completion, and export completion.
3. Webhook contract tests for Stripe/Soniox/ElevenLabs.
4. Regression tests for admin authorization boundaries.

## 5) Suggested Fix Order

1. Lock down admin server-side authorization (C1).
2. Rotate/remove committed secrets and fix ignore rules (C2).
3. Repair broken user-critical flows (H1, H2, H8).
4. Fix transcription/billing consistency (H3, H4).
5. Fix OAuth and identity trust issues (H5, H6, H7).
6. Clean lint config + source lint failures (M4, L1).
7. Stabilize export/job architecture (M6, M7).

