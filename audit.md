**Audit Report (Deep Dive)**
Scope covered: API routes, server actions, DB layer/indexing, billing/Stripe, transcription pipelines/webhooks, auth/session, admin modules, exports, UI hooks/components, scripts, and quality gates (`typecheck`, `lint`).

**Result:** codebase is generally type/lint clean, but has major security and data-integrity gaps plus several unimplemented/partial product features.

## 1) Critical findings (fix first)

1. **Leaked production-grade credential in repo**
Evidence: [`/Users/virusz4274/development/call-memo/service-account.json`](/Users/virusz4274/development/call-memo/service-account.json)  
Impact: full Firebase service-account compromise risk.  
Action: rotate key immediately, revoke old key, remove file from git history, move to secret manager/env mount.

2. **Webhook trust + replay/idempotency gaps can corrupt billing/usage**
Evidence:  
- ElevenLabs webhook lacks signature verification: [`/Users/virusz4274/development/call-memo/src/app/api/webhooks/elevenlabs/route.ts`](/Users/virusz4274/development/call-memo/src/app/api/webhooks/elevenlabs/route.ts)  
- Soniox auth is optional: [`/Users/virusz4274/development/call-memo/src/app/api/webhooks/soniox/route.ts`](/Users/virusz4274/development/call-memo/src/app/api/webhooks/soniox/route.ts)  
- External transcription ID is stored but not validated on callback: [`/Users/virusz4274/development/call-memo/src/app/actions/upload/transcription.ts`](/Users/virusz4274/development/call-memo/src/app/actions/upload/transcription.ts)  
Impact: forged/replayed webhooks can mark wrong recordings completed and increment usage multiple times.  
Action: require signature validation, enforce strict event schema + transcription ID match, store webhook/event dedupe key, make usage increment atomic/idempotent.

## 2) High-severity correctness/data gaps

3. **Semantic search pagination contract broken (`totalCount` is page length)**
Evidence: [`/Users/virusz4274/development/call-memo/src/lib/db/search.ts`](/Users/virusz4274/development/call-memo/src/lib/db/search.ts)  
Impact: incorrect “X results” and broken pager behavior.  
Action: run real count query for filter or return explicit `hasMore` contract only.

4. **Filesystem browser silently drops data after 1000 recordings**
Evidence: [`/Users/virusz4274/development/call-memo/src/app/api/filesystem/route.ts`](/Users/virusz4274/development/call-memo/src/app/api/filesystem/route.ts)  
Impact: heavy users cannot browse all recordings.  
Action: paginate tree build or precompute materialized folder index.

5. **Admin user deletion is incomplete**
Evidence: [`/Users/virusz4274/development/call-memo/src/app/actions/admin/users/mutations.ts`](/Users/virusz4274/development/call-memo/src/app/actions/admin/users/mutations.ts)  
Impact: orphaned records (notifications/export/support/other linked docs), inconsistent admin state.  
Action: define deletion policy (cascade vs soft-delete) and enforce across all collections.

6. **Admin search uses unsanitized regex input**
Evidence: [`/Users/virusz4274/development/call-memo/src/app/actions/admin/users/shared.ts`](/Users/virusz4274/development/call-memo/src/app/actions/admin/users/shared.ts)  
Impact: malformed patterns can error; expensive regex can degrade query performance.  
Action: escape user input or switch to normalized indexed search fields.

## 3) Medium-severity reliability/product gaps

7. **Health dashboard marks services “operational” without real liveness checks**
Evidence: [`/Users/virusz4274/development/call-memo/src/app/actions/admin-health.ts`](/Users/virusz4274/development/call-memo/src/app/actions/admin-health.ts)  
Impact: false confidence during outages.  
Action: add actual provider pings/HEAD checks with latency + failure reason.

8. **Pricing page is hardcoded and can drift from DB plan config**
Evidence: [`/Users/virusz4274/development/call-memo/src/components/pricing-section.tsx`](/Users/virusz4274/development/call-memo/src/components/pricing-section.tsx)  
Impact: wrong pricing shown vs checkout reality.  
Action: source pricing/features from published plans API.

9. **Profile ensure flow can report false failure**
Evidence: [`/Users/virusz4274/development/call-memo/src/hooks/firebase/use-user-profile.tsx`](/Users/virusz4274/development/call-memo/src/hooks/firebase/use-user-profile.tsx)  
Impact: user profile init can appear failed even on success.  
Action: return/check `success` consistently, not `wasCreated`.

10. **Auth/session implementation inconsistencies**
Evidence:  
- Login cookie duration semantics unclear: [`/Users/virusz4274/development/call-memo/src/app/api/auth/login/route.ts`](/Users/virusz4274/development/call-memo/src/app/api/auth/login/route.ts)  
- Logout GET fallback redirects to localhost:3000: [`/Users/virusz4274/development/call-memo/src/app/api/auth/logout/route.ts`](/Users/virusz4274/development/call-memo/src/app/api/auth/logout/route.ts)  
Impact: brittle behavior across environments.  
Action: normalize cookie lifetime config and redirect host strategy.

11. **Client redirect usage in root page is fragile**
Evidence: [`/Users/virusz4274/development/call-memo/src/app/page.tsx`](/Users/virusz4274/development/call-memo/src/app/page.tsx)  
Impact: hydration/redirect edge-case risk depending on runtime behavior.  
Action: move redirect decision to server boundary/middleware.

## 4) Missing or partially implemented features

12. **Forgot password flow missing**
Evidence: placeholder link in login UI: [`/Users/virusz4274/development/call-memo/src/components/pages/login-page.tsx`](/Users/virusz4274/development/call-memo/src/components/pages/login-page.tsx)  
Needed: full reset request/confirm UX and API integration.

13. **Recording details/transcription UX uses page reloads instead of stateful updates**
Evidence: [`/Users/virusz4274/development/call-memo/src/components/recording-details-dialog.tsx`](/Users/virusz4274/development/call-memo/src/components/recording-details-dialog.tsx)  
Needed: optimistic mutation + targeted revalidation; remove hard reloads.

14. **Insufficient DB index coverage for operational collections**
Evidence: [`/Users/virusz4274/development/call-memo/src/lib/db/init/indexes.ts`](/Users/virusz4274/development/call-memo/src/lib/db/init/indexes.ts)  
Needed: indexes for `export_jobs`, `notifications`, `support_messages`, webhook dedupe/event tables.

15. **No meaningful automated test coverage for critical flows**
Evidence: no substantial unit/integration tests in app code (only helper script + Android sample tests).  
Needed: webhook security/idempotency tests, billing sync tests, export pipeline tests, auth/session tests, search pagination tests.

## 5) Quality gate status
- `npm run typecheck`: pass  
- `npm run lint`: pass  
Interpretation: static quality is okay, but major runtime/security/data issues remain.

## 6) Recommended remediation order
1. Secret rotation + git history cleanup for `service-account.json`.
2. Webhook hardening (auth/signatures, ID matching, dedupe/idempotency).
3. Data correctness fixes (search count, filesystem pagination, admin delete cascade).
4. Product consistency (dynamic pricing, auth redirects/cookie semantics, profile ensure return path).
5. Implement missing features (password reset, non-reload UX).
6. Add tests around all above before further feature expansion.

If you want, I can start executing this in that exact order and open with the incident fix + webhook hardening first.