# Full Application Audit - 2026-03-19

## Scope

This audit reviewed the current Call Memo / VoSift codebase across:

- product architecture
- security and operational hardening
- core business logic
- deployment posture
- background processing reliability
- testing coverage

Companion audits already in the repo:

- `docs/code-audit-2026-03-19.md`
- `docs/ui-ux-audit-2026-03-19.md`

This report revalidates the current worktree instead of assuming all earlier findings are still open.

## Verification Completed

- `npm run lint` - passed
- `npm run typecheck` - passed
- `npm run build` - passed
- `npm audit --omit=dev` - 16 production vulnerabilities reported
- Next.js dev server runtime check on port `9000` - no current browser/runtime errors detected

## Executive Summary

The application is feature-rich and materially closer to production-ready than many projects at this stage. The current worktree appears to have already fixed several earlier high-risk implementation problems, including clip-share token handling, delete ordering, transcription usage idempotency, contact aggregate recalculation, and Google sync state persistence.

The biggest remaining risks are now less about basic correctness and more about trustworthiness in production:

1. secrets handling is unsafe
2. the dependency baseline includes known vulnerabilities
3. public endpoints are not hardened against abuse
4. privacy-sensitive tokens are stored too casually
5. important background work is still best-effort instead of durable

Business-logic wise, the product promise is strong, but a few implementation choices undermine the positioning:

- the app presents itself as privacy-conscious and self-hostable, but secret management and a hard-coded Firebase auth rewrite cut against that story
- core user outcomes like "uploaded" and "sync started" are still not backed by durable job guarantees
- billing is wired deeply enough to work, but some Stripe/customer creation behavior is too eager for the typical free-trial funnel

## What Looks Good

- Build, lint, typecheck, and local runtime are clean.
- The app has real guardrails around ownership checks, signed URLs, and webhook signature verification.
- Delete flows now preserve retryability by deleting storage before deleting DB records.
- Shared clip links now include clip bounds in the signed token instead of trusting raw query params.
- Transcription usage reporting now has recording-level protection against duplicate reporting.
- Contact reconciliation and aggregate maintenance look meaningfully stronger than in the earlier audit.
- Google Contacts sync now has persisted connection/sync state and restart support.

## Highest-Priority Findings

### P0 - Secrets are committed to git and baked into the runtime image

Severity: Critical

Evidence:

- `.gitignore` explicitly comments out `.env` and `service-account.json`, so they are not ignored.
- `git ls-files` shows both `.env` and `service-account.json` are tracked.
- `service-account.json` contains a Firebase Admin `private_key`.
- `Dockerfile` copies both `.env` and `service-account.json` into the production image.

Why this matters:

- A repo leak or image leak becomes a full credential leak.
- The Firebase Admin service account is especially sensitive because it can mint or verify auth state and access project resources.
- Baking secrets into the image makes rotation, environment separation, and principle-of-least-privilege much harder.
- This is the kind of issue that can overshadow every other application improvement.

Recommended fix:

- Remove tracked secret-bearing files from version control immediately.
- Rotate any credentials that were ever committed, especially the Firebase Admin key.
- Stop copying `.env` and `service-account.json` into the image.
- Use environment injection or a real secret manager at deploy time.
- Re-enable ignore rules for `.env` and `service-account.json`.

Relevant files:

- `.gitignore`
- `Dockerfile`
- `service-account.json`

### P1 - The production dependency baseline currently includes known vulnerabilities

Severity: High

Evidence:

- `npm audit --omit=dev` reported:
  - 7 high vulnerabilities
  - 1 moderate vulnerability
  - 8 low vulnerabilities
- The installed Next.js build reports `16.1.6`.
- The audit output flags `next` below `16.1.7`, including a Server Actions CSRF-related advisory and additional request-handling/cache advisories.
- `@ducanh2912/next-pwa` pulls in a vulnerable `workbox` / `serialize-javascript` chain.

Why this matters:

- This app uses App Router and Server Actions, so framework-level request validation issues are not theoretical.
- The PWA chain is part of the production build path and currently carries a high-severity supply-chain burden.
- Even when no exploit is currently known in your deployment, running behind the patched version raises unnecessary risk.

Recommended fix:

- Upgrade `next` and `eslint-config-next` to a patched version immediately.
- Reassess whether `@ducanh2912/next-pwa` is still the right choice; either patch/replace it or disable PWA until the chain is clean.
- Update vulnerable transitive AWS SDK XML parsing dependencies.
- Add a dependency review checkpoint to release workflow.

Relevant files:

- `package.json`
- `package-lock.json`
- `next.config.ts`

### P1 - Public support submission is open to spam and abuse

Severity: High

Evidence:

- `src/app/api/support/route.ts` accepts anonymous POST requests.
- Each valid request writes to MongoDB and may also send SMTP email.
- There is schema validation, but no rate limiting, CAPTCHA/challenge, origin check, honeypot, or abuse throttling.

Why this matters:

- Attackers can spam the support inbox, database, and outbound email provider cheaply.
- This creates operator noise, email reputation risk, and potentially direct cost.
- Because support is public-facing, this will get hit earlier than more obscure endpoints.

Recommended fix:

- Add per-IP and per-identity rate limiting.
- Add bot mitigation for anonymous requests.
- Queue outbound support email instead of sending inline in the request path.
- Consider a honeypot field and lightweight reputation checks.

Relevant file:

- `src/app/api/support/route.ts`

### P1 - Google refresh tokens are stored in plaintext in user documents

Severity: High

Evidence:

- `src/lib/db/types/user.ts` defines `googleSync.refreshToken` directly on the user document.
- `src/services/google/start-contacts-sync.ts` persists the refresh token into `googleSync`.

Why this matters:

- A database compromise exposes long-lived Google access for connected users.
- This is especially sensitive for a product that handles contact and call-related data.
- "Works technically" is not enough here; this is a privacy and trust issue.

Recommended fix:

- Encrypt refresh tokens before persisting them.
- Prefer envelope encryption with a KMS-backed key.
- Add a disconnect/revoke flow that clears stored tokens.
- Retain only the minimum credential state needed for re-sync.

Relevant files:

- `src/lib/db/types/user.ts`
- `src/services/google/start-contacts-sync.ts`

## Important Findings

### P2 - Core post-response workflows still rely on best-effort `after(...)` execution

Severity: Medium-High

Evidence:

- `src/lib/direct-upload-service.ts` triggers auto-transcription using `after(...)`.
- `src/services/google/start-contacts-sync.ts` triggers contact sync using `after(...)`.

Why this matters:

- If the process crashes, the platform restarts, or the post-response task is dropped, the user can see a success state while the important follow-up work never happens.
- For this product, reliability of transcription and sync completion is part of the product value, not optional polish.
- This is more an operational integrity problem than a code-style problem.

Recommended fix:

- Move these workflows onto a durable job queue or persisted work table.
- Track queued, running, failed, and completed job state explicitly.
- Expose recovery/retry in admin and, where appropriate, the user settings UI.

Relevant files:

- `src/lib/direct-upload-service.ts`
- `src/services/google/start-contacts-sync.ts`

### P2 - Login can create a real session even when app-side profile provisioning fails

Severity: Medium

Evidence:

- `src/app/api/auth/login/route.ts` catches `ensureUserProfile(...)` failures, sets `profileEnsureFailed = true`, and still issues the session cookie.

Why this matters:

- A user can become authenticated with Firebase but not fully provisioned in the app database.
- That creates confusing states where the user appears logged in but product routes may fail with "user not found" or partial behavior.
- This makes incident handling harder because auth success no longer guarantees app readiness.

Recommended fix:

- Distinguish between existing-user transient profile refresh failures and first-login provisioning failures.
- For first-login provisioning failures, do not issue the final session.
- Alternatively, redirect into a dedicated recovery/repair flow that retries provisioning before sending the user into the workspace.

Relevant files:

- `src/app/api/auth/login/route.ts`
- `src/lib/db/users/ensure-profile.ts`

### P2 - Security headers are too narrow for an authenticated app handling sensitive media

Severity: Medium

Evidence:

- `next.config.ts` adds headers only for `/sw.js` and `/manifest.json`.
- There is no general app-wide CSP, HSTS, `X-Frame-Options` / `frame-ancestors`, `Referrer-Policy`, or `Permissions-Policy`.

Why this matters:

- Browser-side defense-in-depth is thin for a product with auth, uploads, notifications, billing, and public share links.
- This does not mean the app is currently exploitable, but it is weaker than it should be for the sensitivity of the data it handles.

Recommended fix:

- Add a baseline security header policy for all routes.
- Introduce a CSP tailored to Firebase, Stripe, Sentry, and required media origins.
- Add HSTS in production behind HTTPS.
- Explicitly set `Referrer-Policy` and `Permissions-Policy`.

Relevant file:

- `next.config.ts`

### P2 - The self-hosted/privacy story is undercut by a hard-coded Firebase auth rewrite

Severity: Medium

Evidence:

- `next.config.ts` rewrites `__/auth/:path*` to a single hard-coded `firebaseapp.com` project.
- The rest of the app uses environment-driven Firebase client config.

Why this matters:

- This creates a hidden deployment dependency on one specific Firebase hosting/auth helper domain.
- It weakens the claim that the app can be moved cleanly between environments or privately self-hosted.
- Operators can configure their own Firebase project in env vars and still be quietly tied back to the baked-in project for auth helper traffic.

Recommended fix:

- Derive this destination from environment configuration.
- If the rewrite is no longer needed, remove it entirely.
- Add deployment tests for non-default Firebase projects.

Relevant file:

- `next.config.ts`

### P2 - Test coverage is too thin for the risk profile of the app

Severity: Medium

Evidence:

- The codebase currently exposes one unit test file in `src/lib/external-service-incidents.test.ts`.
- End-to-end coverage is concentrated in `e2e/smoke.spec.ts`.
- There is no meaningful automated coverage around:
  - billing sync and overage rules
  - webhook idempotency
  - share-link access control
  - cron cleanup
  - mobile direct upload
  - Google sync token lifecycle

Why this matters:

- The riskiest flows in this app are data, money, and async-state flows.
- Those are exactly the places where a green build does not provide real confidence.

Recommended fix:

- Add route-level integration tests for the major API surfaces.
- Add pure unit tests around access-control and billing calculations.
- Add replay/idempotency tests for webhook handlers.
- Add regression tests for share-token enforcement and delete/cleanup behavior.

### P3 - MongoDB SRV fallback can create very slow first-hit behavior when DNS is unhealthy

Severity: Medium-Low

Evidence:

- Local runtime verification showed some first-hit requests taking roughly `48s-50s`.
- During those requests the server logged `Primary SRV resolution failed. Attempting DNS fallback resolvers...`.
- `src/lib/mongodb.ts` first attempts the primary `mongodb+srv://` connection and only then builds a fallback URI via custom DNS resolvers.

Why this matters:

- In environments with flaky SRV DNS, the app can look broken even when it eventually recovers.
- This affects first impressions, cold starts, health checks, and admin confidence during incidents.
- It is especially painful because it shows up as long hanging requests instead of a fast fail with a clear operator action.

Recommended fix:

- Prefer a fully resolved non-SRV MongoDB URI in environments where SRV is known to be unreliable.
- Consider making fallback behavior explicitly configurable so the app can skip the slow primary attempt where appropriate.
- Add observability around connection mode, latency, and DNS fallback frequency.

Relevant file:

- `src/lib/mongodb.ts`

## Business Logic Observations

### Billing is operationally solid enough to continue, but too eagerly coupled to onboarding

`ensureUserProfile()` attempts to create a Stripe customer for any user missing `stripeCustomerId` whenever billing is enabled, including free or trial users.

Why this matters:

- It inflates Stripe customer count with users who may never enter a billing flow.
- It couples login/profile creation to billing availability.
- It creates more operational noise than value early in the funnel.

Recommendation:

- Create Stripe customers lazily at the first checkout, portal open, or overage opt-in.

### The product promise depends on completion guarantees more than instant responses

For this app, "your file is uploaded" is not the end of the job. Users care whether it is searchable, transcribed, linked, and retrievable later.

Why this matters:

- Best-effort background work is fine for low-stakes enrichment.
- It is not a great long-term fit for the core product outcome.

Recommendation:

- Treat ingestion/transcription/sync as first-class jobs with status, retries, and observability.

### Privacy-sensitive positioning should be reflected in operational choices

The app handles call archives, contacts, summaries, and transcripts. That makes trust part of the product, not just a technical property.

Why this matters:

- Plaintext refresh tokens, tracked secret files, and image-baked credentials undermine the brand promise even if no incident occurs.

Recommendation:

- Prioritize credential hygiene and secrets handling ahead of new feature work.

## Missing Or Underdeveloped Areas

- No visible abuse/rate-limiting layer for public endpoints.
- No durable job runner for core asynchronous workflows.
- No strong secrets-management story for deployment.
- No meaningful automated coverage for the highest-risk product flows.
- No broad app-wide browser security header policy.

## Suggested Priority Order

### This week

1. Rotate and remove committed secrets.
2. Stop copying `.env` and `service-account.json` into the Docker image.
3. Patch Next.js and the PWA/dependency vulnerability chain.
4. Add abuse protection to `/api/support`.

### Next 2 weeks

1. Encrypt Google refresh tokens at rest.
2. Add app-wide security headers.
3. Tighten login/profile provisioning so "logged in" implies "fully provisioned."

### Next month

1. Move `after(...)`-based core workflows onto a durable queue.
2. Add integration tests around billing, webhooks, share links, and cleanup jobs.
3. Remove hard-coded deployment assumptions from auth config.

## Overall Assessment

The application is in a much better place than a superficial code scan would suggest. The core product model is coherent, and several earlier correctness issues appear to be actively resolved in the current worktree.

The remaining blockers are mostly the kinds of things that matter when an app starts handling real customer trust at scale:

- secret hygiene
- dependency patching
- anti-abuse controls
- durable async execution
- stronger security posture

If those are addressed, the project moves from "feature-rich and promising" to something much easier to trust operationally.
