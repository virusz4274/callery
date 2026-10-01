# Vosift Code Audit Ledger

Systematic file-by-file audit. Each file is read in full and checked for:
correctness bugs, auth gaps, error-handling holes, dead/unwired UI, data-loss
paths, metering/billing leaks, and unhandled edge cases.

Legend: ⬜ not started · 🔍 in progress · ✅ clean · 🐛 bugs found (fixed) · ⚠️ findings deferred · ⏭️ skipped (trivial/static)

## 1. API routes (highest risk: auth, money, data loss)

| # | File | Status | Findings |
|---|------|--------|----------|
| 1.1 | src/app/api/recordings/route.ts | 🐛 | Re-verified; B-026 (page overflow → Infinity skip) — FIXED |
| 1.2 | src/app/api/recordings/[id]/route.ts | 🐛 | B-014 (500 on bad id), B-016 (no Stripe refund, usage reclaim on R2 fail) — FIXED |
| 1.3 | src/app/api/recordings/[id]/play/route.ts | 🐛 | B-014 — FIXED |
| 1.4 | src/app/api/transcribe/route.ts | 🐛 | Missing Stripe reportUsage — FIXED. B-014 — FIXED. Full re-read done |
| 1.5 | src/app/api/contacts/route.ts | ✅ | Re-verified clean (clamps, search, count agreement) — Group 1 complete |
| 1.6 | src/app/api/filesystem/route.ts | 🐛 | B-024 (silent 1000-cap truncation) — FIXED with flag + UI notice |
| 1.7 | src/app/api/stats/route.ts | ✅ | Clean (auth, single call, error path) |
| 1.8 | src/app/api/stripe/checkout/route.ts | ✅ | Clean; metadata.authSubject matches webhook reader |
| 1.9 | src/app/api/stripe/portal/route.ts | ✅ | Clean |
| 1.10 | src/app/api/stripe/webhook/route.ts | ✅ | Clean (sig verify, all sub/invoice events sync) |
| 1.11 | src/app/api/user/profile/route.ts | 🐛 | B-018 (unvalidated settings shapes) — FIXED |
| 1.12 | src/app/api/user/billing-settings/route.ts | 🐛 | B-015 (free users stuck with overage on) — FIXED |
| 1.13 | src/app/api/user/ensure-profile/route.ts | 🐛 | B-019 (unauthenticated profile minting) — FIXED |
| 1.14 | src/app/api/user/invoices/route.ts | ✅ | Re-verified: auth + lookup + error paths clean |
| 1.15 | src/app/api/support/route.ts | 🐛 | B-025 (open relay, no rate limit) — FIXED |
| 1.16 | src/app/api/cron/purge-recordings/route.ts | ✅ | Re-verified: CRON_SECRET guard + summary clean |
| 1.17 | src/app/api/cron/digest/route.ts | ✅ | Re-verified: guard + due-window + skip-empty clean |
| 1.18 | src/app/api/auth/[...all]/route.ts | ✅ | Clean (provider-gated better-auth passthrough) |
| 1.19 | src/app/api/auth/login/route.ts | 🐛 | B-021 (stack leak), B-022 (cookie maxAge ms→13yr) — FIXED |
| 1.20 | src/app/api/auth/logout/route.ts | 🐛 | B-023 (stale :3000 fallback) — FIXED |
| 1.21 | src/app/api/auth/google/callback/route.ts | ✅ | Re-verified: state check, cookie clear, all-paths redirect |

## 2. Server actions

| # | File | Status | Findings |
|---|------|--------|----------|
| 2.1 | src/app/actions/upload-recordings.ts | 🐛 | B-027 (stale transcript/transcriptSnippet fields), B-028 (orphan R2 on DB fail) — FIXED |
| 2.2 | src/app/actions/admin.ts | 🐛 | B-029 (self/last demotion), B-030 (limits validation), B-031 (missing guards) — FIXED |
| 2.3 | src/app/actions/delete-recordings.ts | ✅ | Re-verified clean (R2+storage+refund semantics) |
| 2.4 | src/app/actions/delete-account.ts | ✅ | Re-verified clean |
| 2.5 | src/app/actions/contacts.ts | 🐛 | Dead import removed; flow clean |
| 2.6 | src/app/actions/save-contacts.ts | 🐛 | B-033 (cross-user contact writes) — FIXED via session check + lib core |
| 2.7 | src/app/actions/google-auth.ts | 🐛 | State fix earlier; session guard added — FIXED |
| 2.8 | src/app/actions/search-actions.ts | ✅ | Re-verified clean (pagination, auth, empty-query) |
| 2.9 | src/app/actions/admin-plans.ts | 🐛 | B-034 (no validation), B-035 (delete default/subscribed) + read guards — FIXED |
| 2.10 | src/app/actions/admin-settings.ts | 🐛 | B-036 (debug logs per request), B-037 (unvalidated update) — FIXED |
| 2.11 | src/app/actions/admin-announcements.ts | 🐛 | B-038 (stale /dashboard revalidate), B-039 (no validation/id checks) + read guard — FIXED |
| 2.12 | src/app/actions/audit-log.ts | 🐛 | B-032 (forgeable/readable audit trail) + paging clamps — FIXED |
| 2.13 | src/app/actions/plans.ts | ✅ | Public-safe fields only — intentionally public |
| 2.14 | src/app/actions/update-contact-plan.ts | 🐛 | B-040 (ObjectId throw outside try) — FIXED |

## 3. Pages (app router)

| # | File | Status | Findings |
|---|------|--------|----------|
| 3.1 | src/app/page.tsx | ✅ | Re-verified clean — Group 3 complete |
| 3.2 | src/app/layout.tsx | 🐛 | Debug logs removed (same class as B-036) |
| 3.3 | src/app/upload/page.tsx | ✅ | Thin wrapper, clean |
| 3.4 | src/app/files/page.tsx | ✅ | Truncation flag wired (B-024); rest clean |
| 3.5 | src/app/contacts/page.tsx + contacts-client.tsx | ✅ | Re-verified clean |
| 3.6 | src/app/settings/page.tsx | ✅ | Thin wrapper, clean |
| 3.7 | src/app/pricing/page.tsx | ✅ | Billing-disabled branch correct |
| 3.8 | src/app/login/page.tsx + src/app/signup/page.tsx | ✅ | Thin wrappers, clean |
| 3.9 | src/app/support/page.tsx | ✅ | Re-verified clean |
| 3.10 | src/app/changelog/page.tsx | ⏭️ | Static content, verified present |
| 3.11 | src/app/privacy-policy/page.tsx + terms-of-service/page.tsx | ✅ | Sanity-checked (no deletion/export promises) |
| 3.12 | src/app/maintenance/page.tsx + not-found.tsx + global-error.tsx | ✅ | Clean; maintenance enforced w/ admin bypass in app-layout |
| 3.13 | src/app/admin/layout.tsx + admin/page.tsx | 🐛 | B-041 (missing Audit nav) — FIXED; data layer now server-guarded |
| 3.14 | src/app/admin/users/page.tsx + [id]/page.tsx | ✅ | Re-verified clean |
| 3.15 | src/app/admin/plans/page.tsx + settings/page.tsx | ✅ | Clean |
| 3.16 | src/app/admin/announcements/page.tsx + audit/page.tsx | ✅ | Clean |
| 3.17 | src/app/sw.ts + instrumentation + instrumentation-client | 🐛 | B-042 (client Sentry DSN unreachable) — FIXED |

## 4. Components — recordings

| # | File | Status | Findings |
|---|------|--------|----------|
| 4.1 | src/components/recordings-dashboard.tsx | 🐛 | B-045 (silent semantic failure), B-046 (no refresh after retry) — FIXED |
| 4.2 | src/components/recording-details-dialog.tsx | ✅ | Re-verified clean |
| 4.3 | src/components/recordings-table/index.tsx | 🐛 | B-043 (stuck on emptied page) — FIXED |
| 4.4 | src/components/recordings-table/recordings-table-desktop.tsx | 🐛 | B-044 (dead Download item) — FIXED |
| 4.5 | src/components/recordings-table/recordings-table-mobile.tsx | 🐛 | Download parity added (B-044) |
| 4.6 | src/components/recordings-table/types.ts + delete-confirmation-modal.tsx + download-recording.ts | ✅ | Clean (modal pattern reused; downloader new) |
| 4.7 | src/components/expandable-summary.tsx | ✅ | Clean — Group 4 complete |

## 5. Components — pages

| # | File | Status | Findings |
|---|------|--------|----------|
| 5.1 | src/components/pages/upload-page.tsx | 🐛 | B-047 (input not reset, Clear All during upload) — FIXED. 2GB claim verified vs next.config |
| 5.2 | src/components/pages/contacts-page.tsx + contacts-wrapper.tsx | ✅ | Re-verified clean (infinite scroll guards, grouping, empty states) |
| 5.3 | src/components/pages/file-browser-page.tsx | 🐛 | B-048 (in-place sort mutates props), B-049 (file rows dead) — FIXED; missing recordingId type added |
| 5.4 | src/components/pages/settings-page.tsx | 🐛 | B-054 (window.innerWidth in render) — FIXED |
| 5.5 | src/components/pages/login-page.tsx + signup-page.tsx | 🐛 | B-050 (dead Forgot-password link) — FIXED with full reset flow; derived-state lint fix |
| 5.6 | src/components/pages/landing-page.tsx + landing/* (4) | 🐛 | Footer dead social icons + stale year — FIXED; CTAs verified |
| 5.7 | src/components/pages/legal-document-page.tsx | ✅ | Static renderer, clean |
| 5.8 | src/components/pages/admin/admin-dashboard.tsx + user-details-page.tsx | 🐛 | B-053 (unhandled cleanup throw + alert) — FIXED |
| 5.9 | src/components/pricing-section.tsx | 🐛 | B-051 (dead Get Started), B-052 (?canceled ignored) — FIXED |

## 6. Components — shell/navigation/settings/admin UI

| # | File | Status | Findings |
|---|------|--------|----------|
| 6.1 | src/components/app-layout.tsx + app-header.tsx | 🐛 | Timezone publisher added (B-056); rest clean |
| 6.2 | src/components/navigation/main-nav.tsx + mobile-menu.tsx + user-dropdown.tsx | ✅ | Clean (all linked routes verified; profile item disabled) |
| 6.3 | src/components/mobile-nav.tsx | ✅ | Clean (all 6 admin items reachable; no slice drops) |
| 6.4 | src/components/settings/settings-page.tsx + profile-settings.tsx | ✅ | Clean (zod-validated forms) |
| 6.5 | src/components/settings/general-settings.tsx + notifications-settings.tsx | 🐛 | B-055 (uncontrolled digest radio), B-056 (timezone never applied) — FIXED |
| 6.6 | src/components/settings/data-settings.tsx + google-connect-dialog.tsx | ✅ | Clean (danger zone wired, re-verified) |
| 6.7 | src/components/settings/billing-settings.tsx | 🐛 | B-063 (silent invoice failure) — FIXED; rest clean |
| 6.8 | src/components/admin/user-management-table.tsx + manage-plan-dialog.tsx + edit-limits-dialog.tsx | 🐛 | B-057 (silent failures), B-058 (ignored plan result) — FIXED |
| 6.9 | src/components/admin/plans-list.tsx + plan-form-dialog.tsx + settings-form.tsx | 🐛 | B-057/B-059 (silent/delete failures, alerts, validation) — FIXED |
| 6.10 | src/components/admin/announcements-list.tsx + announcement-form-dialog.tsx + audit-logs-table.tsx + admin-stats-card.tsx | 🐛 | B-057/B-060/B-076 (silent delete, UTC shift, clear-filter, system actions) — FIXED |
| 6.11 | src/components/toast-provider.tsx + ui-primitives.tsx + client-only.tsx + client-formatted-date.tsx | 🐛 | B-056 timezone dates; lint fixes (mount/try-JSX) — FIXED |
| 6.12 | src/components/theme-provider.tsx + theme-switcher.tsx + service-worker-unregister.tsx | ✅ | Clean |
| 6.13 | src/components/announcement-banner.tsx + billing-alert.tsx + email-verification-alert.tsx | 🐛 | B-062 (stuck resend spinner) — FIXED; ?tab=billing deep-link verified |
| 6.14 | src/components/dashboard/stats-card.tsx + background.tsx + icons* | ✅ | Clean |

## 7. Hooks

| # | File | Status | Findings |
|---|------|--------|----------|
| 7.1 | src/hooks/use-recordings.ts | ✅ | Re-verified clean (error paths intact) |
| 7.2 | src/hooks/use-contacts.ts | ✅ | Re-verified clean |
| 7.3 | src/hooks/use-stats.ts | 🐛 | B-066 (silent non-OK) — FIXED |
| 7.4 | src/hooks/use-settings-page.ts | 🐛 | B-061 tab clamp, dirty-ref removal, assign() — FIXED; sync effect clean |
| 7.5 | src/hooks/settings/use-profile-settings.ts + use-notification-settings.ts + use-preference-settings.ts | 🐛 | B-064 (success-on-failure saves) — FIXED; hook-owned dirty state |
| 7.6 | src/hooks/firebase/use-user-profile.tsx | 🐛 | B-020 fixed earlier; fetch deferred for set-state-in-effect — FIXED |
| 7.7 | src/hooks/use-local-storage.tsx + use-mobile.tsx + use-table-selection.ts | ✅ | Clean |

## 8. Lib — db

| # | File | Status | Findings |
|---|------|--------|----------|
| 8.1 | src/lib/db/recordings.ts | ✅ | Re-verified (no stubs; gates green) |
| 8.2 | src/lib/db/search.ts | ✅ | Re-verified (no stubs; gates green) |
| 8.3 | src/lib/db/contacts.ts | 🐛 | B-069 (merge path skipped record linking) — FIXED |
| 8.4 | src/lib/db/users.ts | ✅ | Clean (cycle reset called at both metered entries) |
| 8.5 | src/lib/db/retention.ts + delete-user-data.ts | ✅ | Re-verified (no stubs; gates green) |
| 8.6 | src/lib/db/init.ts | ✅ | Re-verified (no stubs; gates green) |
| 8.7 | src/lib/db/converters.ts + types.ts + index.ts | 🐛 | Legacy-date hardening; billing-field alarm cleared (API inlines fields) |
| 8.8 | src/lib/db/system-log.ts + migrate-unknown-recordings.ts | 🐛 | B-068 (stale contact stats after name-match) — FIXED |
| 8.9 | src/lib/mongodb.ts | 🐛 | B-067 (cached connect rejection = permanent outage) — FIXED |

## 9. Lib — auth/config/infra

| # | File | Status | Findings |
|---|------|--------|----------|
| 9.1 | src/lib/auth-utils.ts + admin-auth.ts | ✅ | Clean (session cookie name verified) |
| 9.2 | src/lib/auth/client.tsx + local-client.ts + local.ts | 🐛 | B-070 (signup name dropped), B-072 (email HTML injection) — FIXED |
| 9.3 | src/lib/auth/firebase.ts + types.ts | ✅ | Clean |
| 9.4 | src/lib/firebase/admin.ts + client.ts + config.ts + provider.tsx + client-provider.tsx | 🐛 | Provider lazy init (set-state-in-effect) — FIXED |
| 9.5 | src/lib/api-client.ts | ✅ | Clean |
| 9.6 | src/lib/config.ts | ✅ | Clean (lazy validated env) |
| 9.7 | src/lib/access-control.ts | 🐛 | Legacy string-date coercion hardened — FIXED |
| 9.8 | src/lib/r2.ts | ✅ | Clean |
| 9.9 | src/lib/stripe.ts + stripe/sync.ts + stripe/usage.ts + stripe/invoices.ts | 🐛 | B-073 (SDK v22 period → Invalid Date) — FIXED; const/mutation cleanup |
| 9.10 | src/lib/email/* (5) incl. notifications.ts | ✅ | Re-verified clean (ingest + digest wired) |
| 9.11 | src/lib/utils.ts + utils/billing.ts + utils/filename-parser.ts + constants.ts + types.ts | 🐛 | B-074 (filename date overflow) — FIXED |
| 9.12 | src/lib/logger.ts + docs/api-patterns.ts + data/invoice-data.ts + placeholder-images* | ✅ | Clean (invoice-data dead mock, harmless; placeholders used) |
| 9.13 | src/config/navigation.ts | ⏭️ | Static nav config, verified in use |

## 10. Services

| # | File | Status | Findings |
|---|------|--------|----------|
| 10.1 | src/services/transcription/index.ts + types.ts + failure-events.ts | ✅ | Clean (override-aware router) |
| 10.2 | src/services/transcription/soniox-service.ts | ✅ | Clean (after() background verified) |
| 10.3 | src/services/transcription/elevenlabs-service.ts | ✅ | Clean |
| 10.4 | src/services/transcription/gemini-transcription-service.ts | ✅ | Clean (upload cleanup in finally) |
| 10.5 | src/services/transcription/openai-compat-service.ts | ✅ | Clean (3-tier fallback) |
| 10.6 | src/services/ai/index.ts + types.ts + client.ts + prompts.ts + failure-events.ts | ✅ | Clean |
| 10.7 | src/services/ai/gemini-service.ts + openai-compat-service.ts | ✅ | Clean (graceful degradation) |
| 10.8 | src/services/google/oauth.ts + contacts-sync.ts | 🐛 | B-075 (silent bg-sync failure) + B-076 (audit filter blind to system events) — FIXED |

## 11. Scripts

| # | File | Status | Findings |
|---|------|--------|----------|
| 11.1 | scripts/check-db.ts + check-user-stripe.ts + debug-contacts.ts + debug-transcripts.ts + fix-speaker-ids.ts + test-recording.ts + verify_plans_and_usage.ts + verify-pwa.mjs | 🐛 | B-077 via src/scripts (below); debug scripts schema-clean |
| 11.2 | src/scripts/backfill-contact-counts.ts + fix-contact-stats.ts | 🐛 | B-077 (backfill excluded archived, disagreeing with live counts) — FIXED |

## 12. Coverage sweep (files missed by groups 1-11)

| # | File | Status | Findings |
|---|------|--------|----------|
| 12.1 | src/components/landing/hero-section.tsx + features-section.tsx + testimonials-section.tsx + footer-section.tsx | 🐛 | B-079 (dynamic Tailwind), B-080 (dead button) — FIXED; Chip typing fixed |
| 12.2 | src/components/icons/apple-icon.tsx + google-icon.tsx + icons.tsx | ✅ | Clean (static SVGs) |
| 12.3 | src/components/pages/forgot-password-page.tsx + reset-password-page.tsx | 🐛 | B-078 (reset enumeration leak) — FIXED |
| 12.4 | src/instrumentation.ts + instrumentation-client.ts | ✅ | Clean (Sentry wiring) |
| 12.5 | src/lib/timezone.ts + email/smtp-service.ts + email/resend-service.ts + placeholder-images.ts + scripts/verify-pwa.mjs | ✅ | Covered in 6.x/9.x/11.x reads; no new findings |

## Bug log (all findings across passes)

| ID | Area | Bug | Severity | Status |
|----|------|-----|----------|--------|
| B-001 | transcribe | Missing Stripe reportUsage on manual transcribe | high (revenue leak) | Fixed |
| B-002 | oauth | State token never validated (CSRF) | high (security) | Fixed |
| B-003 | oauth callback | No return when code missing → 500 | medium | Fixed |
| B-004 | account | No self-serve deletion | medium | Fixed |
| B-005 | admin delete | Could delete own admin account; Stripe cancel missing | medium | Fixed |
| B-006 | search/pagination | (prior goal) skip/page mismatch, client-only search | high | Fixed |
| B-007 | invoices | Mocked/placeholder invoice lists | medium | Fixed |
| B-008 | support | Dead buttons, form dropped messages | medium | Fixed |
| B-009 | retention | deletionPolicy unenforced | medium | Fixed |
| B-010 | notifications | Settings never honored | medium | Fixed |
| B-011 | recording dialog | reload()/alert() after transcribe | low | Fixed |
| B-012 | metadata | No star/archive/tags UI | low | Fixed |
| B-013 | admin detail | Manage Plan commented out | low | Fixed |
| B-014 | api [id]/play/transcribe | Malformed ObjectId → 500 instead of 400 | low | Fixed |
| B-015 | billing-settings | Free-plan users blocked from disabling overage | low | Fixed |
| B-016 | api [id] DELETE | No Stripe storage refund; usage reclaimed even when R2 delete failed | medium (metering) | Fixed |
| B-017 | settings | No feedback after Stripe checkout return (?success/?canceled ignored) | low | Fixed |
| B-018 | profile/recordings PATCH | Unvalidated payload shapes (settings enums, tags, contactId type) | medium | Fixed |
| B-019 | ensure-profile | No auth: anyone could mint profiles for arbitrary subjects | high (security) | Fixed |
| B-020 | use-user-profile | wasCreated=false treated as failure (concurrent-create race) | low | Fixed |
| B-021 | api errors | Stack traces / internal error messages returned to clients (login, transcribe, stripe, ensure-profile) | medium (info disclosure) | Fixed |
| B-022 | login cookie | maxAge set in ms (~13yr) instead of seconds | low | Fixed |
| B-023 | logout GET | Redirect fallback to stale :3000 origin | low | Fixed |
| B-024 | filesystem | Tree silently truncated past 1000 recordings | low | Fixed |
| B-025 | support API | Public form with no rate limit (spam relay) | medium | Fixed |
| B-026 | recordings API | Absurd page param overflows skip to Infinity | low | Fixed |
| B-027 | upload | Stale transcript/transcriptSnippet fields written to every recording | low | Fixed |
| B-028 | upload | R2 orphan when Mongo insert fails after R2 upload | low | Fixed |
| B-029 | admin roles | Self-demotion + last-admin demotion allowed (lockout risk) | medium | Fixed |
| B-030 | admin limits | Negative/NaN limits accepted | low | Fixed |
| B-031 | admin actions | Missing auth on getSystemStats/getUsers/getUserById/getUserRecordings/orphan fns + unescaped search + unbounded paging | high (security) | Fixed |
| B-032 | audit-log | Forgeable audit entries + world-readable logs | high (security) | Fixed |
| B-033 | save-contacts | authSubject param trusted: cross-user contact writes | high (security) | Fixed |
| B-034 | admin-plans | No input validation on create/update | low | Fixed |
| B-035 | admin-plans | Default/subscribed plans deletable | medium | Fixed |
| B-036 | admin-settings | Debug console.logs on every request (root layout path) | low | Fixed |
| B-037 | admin-settings | Unvalidated booleans + unchecked defaultPlanId | low | Fixed |
| B-038 | announcements | revalidatePath('/dashboard') — route doesn't exist | low | Fixed |
| B-039 | announcements | No input validation / id checks | low | Fixed |
| B-040 | update-contact-plan | ObjectId throw outside try (raw 500 vs clean error) | low | Fixed |
| B-041 | admin layout | Audit page exists but has no nav entry (unreachable) | low | Fixed |
| B-042 | sentry client | SENTRY_DSN unreadable in browser → client reporting silently dead | medium | Fixed |
| B-043 | recordings table | Stuck on emptied page after deleting last items | low | Fixed |
| B-044 | recordings table | Download menu item dead (desktop) / missing (mobile) | medium | Fixed |
| B-045 | dashboard | Semantic search failure silent (console only) | low | Fixed |
| B-046 | dashboard | No refresh after retry transcription (stale status) | low | Fixed |
| B-047 | upload page | File input not reset (same-file reselect dead); Clear All active mid-upload | low | Fixed |
| B-048 | file browser | In-place sort() mutates prop tree on every render | low | Fixed |
| B-049 | file browser | Clicking a file does nothing | medium | Fixed |
| B-050 | login | Forgot-password link dead (href="#"); reset emails supported but no UI | medium | Fixed |
| B-051 | pricing | Free "Get Started" button dead | low | Fixed |
| B-052 | pricing | ?canceled return ignored (no feedback) | low | Fixed |
| B-053 | admin dashboard | Orphan cleanup throw unhandled + alert() result | low | Fixed |
| B-054 | settings page | window.innerWidth read during render (stale, prerender-unsafe) | low | Fixed |
| B-055 | notifications settings | Uncontrolled digest radio (stale after async load) | low | Fixed |
| B-056 | timezone | Preferred zone stored but never applied to display | medium | Fixed |
| B-057 | admin UI | Role/status/limits/plan/announcement failures silent (no toast, misleading refresh) | medium | Fixed |
| B-058 | manage-plan-dialog | Ignored {success:false} return, always toasted success | medium | Fixed |
| B-059 | admin forms | alert() instead of toasts; missing numeric validation | low | Fixed |
| B-060 | announcement dialog | toISOString UTC shift in datetime-local inputs | low | Fixed |
| B-061 | settings ?tab= | Unvalidated tab param blanks settings page (incl. billing-off) | low | Fixed |
| B-062 | email-verification-alert | Resend throw left spinner stuck | low | Fixed |
| B-063 | billing invoices | Invoice fetch failure silent (empty list) | low | Fixed |
| B-064 | settings saves | Notifications/general/data saves toasted success without response.ok check | high | Fixed |
| B-065 | recordings table | Selection not cleared on search/filter/sort at same page | low | Fixed |
| B-066 | use-stats | Non-OK stats response silent (null stats, null error) | low | Fixed |
| B-067 | mongodb client | First-connect failure cached forever (no retry until redeploy) | medium | Fixed |
| B-068 | contact migration | Name-matched links left contact counts stale | low | Fixed |
| B-069 | createContact merge | Merge path never linked recordings for new numbers | low | Fixed |
| B-070 | firebase signup | displayName dropped (never set on Firebase user) | low | Fixed |
| B-071 | signups disabled | ensure-profile 500 + signup ignored failure (silent broken state) | medium | Fixed |
| B-072 | auth emails | Unescaped user.name in HTML email templates | low | Fixed |
| B-073 | stripe sync | SDK v22 removed subscription.current_period_end → Invalid Date in DB | high | Fixed |
| B-074 | filename parser | Date overflow (month 13, Feb 30) accepted as valid dates | low | Fixed |
| B-075 | google sync | Background sync failure console-only (user saw "Sync started") | low | Fixed |
| B-076 | audit-log filter | System actions (TRANSCRIPTION_*, AI_STEP_FAILED, etc.) unfilterable | low | Fixed |
| B-077 | backfill-contact-counts | Excluded archived recordings (live counts are lifetime) | low | Fixed |
| B-078 | forgot-password | Firebase user-not-found error leaked account existence | low | Fixed |
| B-079 | features-section | Dynamic Tailwind classes (bg-${color}) never generated | low | Fixed |
| B-080 | testimonials | Dead "Read more stories" button (no target page) | low | Fixed |
