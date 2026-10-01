## Goal

Turn this app into one open-source codebase with two personalities switched purely by env: a **self-host** profile (MongoDB + any S3-compatible storage + local or Firebase auth, no billing, operator-chosen transcription/email providers) and a **managed** profile (your hosted SaaS: Firebase auth, Stripe billing, metered usage with per-provider multipliers). No forks, no branches, no data migrations — greenfield rules: treat it as a new project.

## Success Criteria

- Same image runs both profiles; `docker compose` (app + MongoDB) plus `.env.example` is the whole self-host story. MinIO is documented, not bundled.
- Auth works with `AUTH_PROVIDER=firebase` (unchanged SaaS behavior) or `local` (better-auth email/password, zero Firebase), with email verification + password reset working in local mode via Resend or SMTP.
- Transcription provider is choosable (env default + per-user setting) across Soniox, ElevenLabs, and Gemini; every job records provider, raw seconds, and billed units (seconds × provider multiplier) in a usage ledger.
- Managed mode enforces billed units against allocations; self-host mode tracks and displays usage with gates open.
- Storage runs against any S3-compatible backend via endpoint/region/path-style knobs; upload → playback → delete verified against MinIO as the reference implementation.
- No secrets in repo/history (fresh-project rules: rotate + clean launch), `LICENSE` present, README documents both profiles.

## Key Decisions

1. **Single codebase, two env profiles.** Confirmed by your "no another branch, just env change" — one `src/lib/config.ts` validates `managed` vs `selfhost` profiles at boot.
2. **Auth seam + clean identity rename.** Same seam as before (21-file `lib/firebase` surface, `useUser()`/`useAuth()` client hooks, session-cookie server paths), but since there is no data: rename `firebaseUid` → `authSubject` plus new `authProvider` field everywhere including R2 key prefixes. Local implementation stays **better-auth** (Mongo adapter, email/password, sessions; Auth.js rejected — merged into Better Auth).
3. **Email is greenfield: `IEmailService` with Resend + SMTP.** Verified today: zero email infra — no deps, no env, no sending code; verification is Firebase-built-in (`email-verification-alert.tsx` reads `user.emailVerified`). Local auth needs verification/reset emails, so: `EMAIL_PROVIDER=resend|smtp|none` — Resend via the official `resend` SDK (`RESEND_API_KEY`, `resend.emails.send`) as your requested default, SMTP via Nodemailer v10 (Node 20+, ESM, bundled types) for self-hosters with their own relay, `none` for dev (auto-verify + log links). Firebase mode keeps Firebase emails untouched.
4. **Transcription factory + metering.** `ITranscriptionService` exists but both call sites hardcode `new SonioxService()` and **no provider choice or multipliers exist today** (verified by search) — so this is new design, not migration: `getTranscriptionService()` on `TRANSCRIPTION_PROVIDER` env default with per-user override stored in `transcriptionSettings`; `ElevenLabsService` via `POST /v1/speech-to-text` multipart (`cloud_storage_url` fits `transcribe(fileUrl)` exactly, `diarize` + word timestamps, `xi-api-key`); `GeminiTranscriptionService` via `@google/genai` multimodal audio input (already a dependency; SDK confirms audio input support). Pricing as config, not code: `TRANSCRIPTION_PRICING_JSON='{"soniox":1,"elevenlabs":5,"gemini":0.5}'` (defaults per your 1×/5× sketch; open question 3). Metering hook: today's `incrementTranscriptionUsed(uid, seconds)` (`users.ts:266`, raw `$inc`) becomes `recordTranscriptionUsage(uid, {provider, rawSeconds})` writing billed units + a `usage_events` ledger row. Note: monthly usage reset runs via `checkAndResetUsageCycle` (called from the upload flow); the metering redesign keeps that hook point (managed resets on billing period, self-host accumulates).
5. **Storage stays generic-S3.** Keep `R2_*` names, add `S3_REGION` + `S3_FORCE_PATH_STYLE` (verified first-class `S3Client` option). Compose ships **Mongo only**; MinIO/R2/AWS are documented endpoint recipes, not services.
6. **Billing hardening unchanged** from prior plan (gate `/pricing`, guard `/api/stripe/*`, default off in self-host profile).
7. **License default AGPL-3.0** (open question 1); secrets rotation still mandatory before any public push.

## Steps

### Phase 0 — Clean-launch hygiene
Untrack `.env`/`service-account.json`, `.env.example` with managed + selfhost sections, Dockerfile stops baking secrets, rotate all credentials, Sentry DSN → optional env, delete Sentry demo routes, `LICENSE`, README profiles. *Validation:* secret grep over tracked files clean; build passes with only Mongo + storage + one transcription key.

### Phase 1 — Config module + identity rename
`src/lib/config.ts` with profile validation (fail fast per selected providers); rename `firebaseUid` → `authSubject` + `authProvider` across types, queries, R2 keys, admin gates. *Validation:* `typecheck`; boot matrix (each provider combination starts or fails with an actionable message).

### Phase 2 — Auth seam + local auth
`src/lib/auth/` interface (server `getSessionUser()`/`requireAdmin()`, client `useUser()`/`useAuth()`); Firebase moved behind the interface unchanged; better-auth local with Mongo sessions; `ADMIN_EMAILS` bootstrap; login/signup pages work in both modes (email/password always; Google shown when `GOOGLE_CLIENT_*` present). *Validation:* full auth matrix both providers × web/API/admin; Firebase env unset in local mode.

### Phase 3 — Email providers
`IEmailService` + Resend + Nodemailer-SMTP implementations; wire better-auth verification + reset; Ethereal for SMTP dev testing. *Validation:* signup → receive verification (Resend sandbox / Ethereal inbox) → verify → reset-password round-trip; `EMAIL_PROVIDER=none` auto-verifies in dev.

### Phase 4 — Billing hardening
Per prior plan (pricing gate, route guards, self-host default off). *Validation:* full flow with no Stripe keys and zero Stripe calls; managed mode unchanged.

### Phase 5 — Transcription providers + metering
Factory + `ElevenLabsService` + `GeminiTranscriptionService` (+ spike first: confirm Gemini timestamp/diarization support; fallback is single-segment transcript if unavailable); provider env default + user-level setting UI; pricing config + usage ledger + billed-unit enforcement in managed mode, display-only in self-host. *Validation:* same fixture through all three providers; ledger math (`billed = raw × multiplier`) asserted; managed quota blocks, self-host doesn't.

> Execution note (2026-09-30): live Gemini spike BLOCKED — the stored
> `GOOGLE_GENERATIVE_AI_API_KEY` is rejected by Google (`API_KEY_INVALID`).
> Shipped `GeminiTranscriptionService` with strict response validation +
> untimed-segment fallback instead; timestamp/diarization quality still owed
> (see `docs/launch-checklist.md`). Parser/factory/ledger-math covered by
> deterministic probes. ElevenLabs API shape verified against current docs
> (`cloud_storage_url` passthrough); no key existed to live-test it.

### Phase 6 — Storage knobs + compose + optionals
`S3_REGION`/`S3_FORCE_PATH_STYLE` (+ `S3_PUBLIC_ENDPOINT` for presigned browser playback); compose gains Mongo only; S3-compat recipe docs; contacts UI gated on `NEXT_PUBLIC_GOOGLE_CLIENT_ID`; launch checklist. *Validation:* fresh compose + MinIO-as-external: upload → play → delete; contacts/Gemini/Sentry absent → app fully usable.

## Validation Plan

Repo gates throughout (`typecheck`, `lint` with no new issues, `build` incl. the Serwist postbuild check). Final E2E twice — once per profile from a fresh clone following only the README. Highest-risk validations: Phase 2 auth matrix, Phase 5 Gemini timestamp spike (do it first inside the phase — it can shrink Gemini to a no-diarization tier), and MinIO presigned playback in a real browser (server-reachable ≠ browser-reachable endpoint).

## Risks

- No-migration risk is gone by your call (fresh project) — renames and schema freedom are safe.
- Gemini transcription quality/timestamps unconfirmed — spike before committing to segment parity.
- Multiplier economics are your business call, not engineering — kept as config; wrong defaults only need an env change.
- Email deliverability in self-host is the operator's problem (SPF/DKIM/domain) — docs must say so; Resend recommended path.
- History still contains live secrets until rotation + launch-shape decision (open question 2).

## Open Questions

1. License: accept AGPL-3.0, or MIT/Apache-2.0 for maximum adoption?
2. Public repo shape: fresh repo from the cleaned tree (recommended), or this repo after rotation?
3. Metering defaults: Soniox 1× / ElevenLabs 5× / Gemini 0.5× billed-unit multipliers — confirm or set values?

## Sources

- [https://better-auth.com/docs/adapters/mongo](https://better-auth.com/docs/adapters/mongo)
- [https://better-auth.com/docs/authentication/email-password](https://better-auth.com/docs/authentication/email-password)
- [https://authjs.dev/getting-started/adapters/mongodb](https://authjs.dev/getting-started/adapters/mongodb)
- [https://elevenlabs.io/docs/api-reference/speech-to-text/convert](https://elevenlabs.io/docs/api-reference/speech-to-text/convert)
- [https://resend.com/docs/send-with-nodejs](https://resend.com/docs/send-with-nodejs)
- [https://nodemailer.com/](https://nodemailer.com/)
- [https://www.gnu.org/licenses/agpl-3.0.html](https://www.gnu.org/licenses/agpl-3.0.html)
