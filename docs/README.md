# Documentation Index

This folder contains the maintained documentation for the current Call Memo codebase. These docs are meant to describe the app that exists in `src/`, not historical audits or one-off investigation output.

## Start Here

- [Setup Guide](setup-guide.md): local setup, environment variables, service wiring, webhooks, and cron routes
- [User Guide](user-guide.md): the current end-user workflow across recordings, contacts, files, sharing, settings, support, and Android sync
- [Admin Guide](admin-guide.md): admin routes, health checks, incidents, async jobs, plans, announcements, and runbook notes

## Developer Reference

- [Architecture](architecture.md): system shape, async flows, security boundaries, and repository layout
- [API Reference](api-reference.md): Server Actions, route handlers, signed upload flow, webhooks, and cron endpoints
- [Data Model](data-model.md): MongoDB collections, important document fields, and index/TTL notes
- [Billing](billing.md): seeded plans, Stripe setup, overage accounting, and billing verification notes
- [Android App](android-app.md): Capacitor wrapper behavior, folder sync flow, and Android-specific setup

## Operations And QA

- [Full Application Test Plan](full-application-test-plan.md): manual QA checklist for staging or production-like validation
- [Stripe Billing Verification](stripe-billing-verification.md): focused Stripe re-verification map tied to the current implementation
- [Dependency Review Register](dependency-review.md): lightweight register for deliberate dependency holds and follow-up review work

## Product Snapshot

- Next.js 16 App Router app with React 19 and Tailwind v4
- Direct client-to-R2 uploads with signed completion tokens
- Recording archive with transcripts, summaries, tags, star/archive state, and semantic search support
- Google Contacts sync plus contact-linked recording history
- Export jobs with downloadable archive parts and an offline viewer
- Firebase authentication with email/password and Google sign-in
- Optional Stripe billing, browser push, SMTP delivery, and transcription providers
- Capacitor Android wrapper that loads the hosted app and exposes folder sync on-device
- Admin health combines live checks for MongoDB and Gemini with lighter configuration checks for R2 and transcription providers
