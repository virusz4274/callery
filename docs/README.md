# Documentation Index

This folder contains the maintained documentation for the current Callery codebase.

## Start Here

- [Setup Guide](setup-guide.md): step-by-step local setup, environment variables, service wiring (Better Auth, R2, Stripe, transcription providers, push, SMTP), and first-login admin bootstrap
- [User Guide](user-guide.md): end-user workflow across recordings, contacts, files, sharing, settings, support, and the web PWA
- [Admin Guide](admin-guide.md): admin routes, health checks, incidents, async jobs, plans, announcements, and operator runbook

## Developer Reference

- [Dependency Review](dependency-review.md): current toolchain, security fixes, compatibility decisions and upgrade checks
- [Architecture](architecture.md): system shape, async flows, security boundaries, and repository layout
- [API Reference](api-reference.md): Server Actions, route handlers, signed upload flow, webhooks, and cron endpoints
- [Data Model](data-model.md): MongoDB collections, important document fields, and index/TTL notes
- [Billing](billing.md): seeded plans, complete Stripe configuration walkthrough, overage accounting, access control matrix, and troubleshooting
- [Cron Jobs](cron-jobs.md): background job schedule, authorization, and operational notes
- [Android App](android-app.md): archived native work and retained upload/sync APIs

## Product Snapshot

- Next.js 16 App Router app with React 19 and Tailwind v4
- Direct client-to-R2 uploads with signed completion tokens
- Recording archive with transcripts, summaries, tags, star/archive state, and semantic search support
- Google Contacts sync plus contact-linked recording history
- Export jobs with downloadable archive parts and an offline viewer
- Better Auth authentication backed by MongoDB in every deployment
- Optional Stripe billing, browser push, SMTP delivery, and transcription providers
- Archived Android wrapper; reusable upload/sync APIs remain for a future client
- Admin health combines live checks for MongoDB and Gemini with lighter configuration checks for R2 and transcription providers

- [Branch Reconciliation](branch-reconciliation.md): confirmed choices, preservation, implementation and verification.
