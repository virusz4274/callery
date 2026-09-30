# Launch Checklist

Before opening the repository or deploying the managed service.

## Repository

- [ ] Decide repo shape: fresh repo from the cleaned tree (recommended) vs
      publishing this history after rotation — git history still contains
      live secrets (Stripe, Soniox, Sentry token, Firebase, R2, Gemini).
- [ ] Rotate every credential that ever touched this repo, regardless of shape.
- [ ] Confirm license (`LICENSE` is AGPL-3.0 by default; MIT/Apache-2.0 are the
      permissive alternatives).

## Managed deployment env

- [ ] `AUTH_PROVIDER=firebase` + Firebase client/admin credentials valid.
- [ ] `NEXT_PUBLIC_ENABLE_BILLING=true` + `STRIPE_SECRET_KEY` /
      `STRIPE_WEBHOOK_SECRET` from the live Stripe account.
- [ ] `ADMIN_EMAILS` bootstraps at least one admin.
- [ ] `EMAIL_PROVIDER=resend` + `RESEND_API_KEY`, `EMAIL_FROM` on a verified
      domain (SPF/DKIM configured).
- [ ] `MONGODB_URI` points at the production database; init script applied.
- [ ] `BETTER_AUTH_SECRET` set (only needed for `local`, harmless otherwise).
- [ ] Confirm metering: `TRANSCRIPTION_PRICING_JSON`
      (default Soniox 1× / ElevenLabs 5× / Gemini 0.5×).

## Verification still owed (couldn't run in a sandbox)

- [ ] Gemini transcription spike with a **valid** key: confirm timestamp quality
      and diarization on real audio (stored key was dead; service ships with
      validated parsing + untimed fallback).
- [ ] Real-browser MinIO playback: `S3_PUBLIC_ENDPOINT` split host actually
      plays (server-reachable ≠ browser-reachable).
- [ ] Live-Mongo E2E of local auth: signup → verify → login → reset, once per
      email provider (`resend`, `smtp`).
- [ ] Fresh-clone E2E twice (self-host profile, managed profile) following
      only the README.
- [ ] Fix the pre-existing Sentry release 400s (token/project pairing) or drop
      release tracking.

## Known pre-existing issues (not launch blockers)

- [ ] Checkout route reads `priceId` but the pricing UI sends `planName` —
      managed checkout needs that contract fixed.
- [ ] Lint baseline carries 15 errors / 12 warnings from before this migration.
