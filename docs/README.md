# Documentation Index

This folder contains the maintained documentation for the current Callery codebase.

## Start Here

- [Setup Guide](setup-guide.md): step-by-step local setup, environment variables, service wiring (Firebase, R2, Stripe, transcription providers, push, SMTP), and first-login admin bootstrap
- [User Guide](user-guide.md): end-user workflow across recordings, contacts, files, sharing, settings, support, and Android sync
- [Admin Guide](admin-guide.md): admin routes, health checks, incidents, async jobs, plans, announcements, and operator runbook

## Developer Reference

- [Architecture](architecture.md): system shape, async flows, security boundaries, and repository layout
- [API Reference](api-reference.md): Server Actions, route handlers, signed upload flow, webhooks, and cron endpoints
- [Data Model](data-model.md): MongoDB collections, important document fields, and index/TTL notes
- [Billing](billing.md): seeded plans, complete Stripe configuration walkthrough, overage accounting, access control matrix, and troubleshooting
- [Cron Jobs](cron-jobs.md): background job schedule, authorization, and operational notes
- [Android App](android-app.md): Capacitor wrapper behavior, folder sync flow, and Android-specific setup

## Product Snapshot

- Next.js 16 App Router app with React 19 and Tailwind v4
- Direct client-to-R2 uploads with signed completion tokens
- Recording archive with transcripts, summaries, tags, star/archive state, and semantic search support
- Google Contacts sync plus contact-linked recording history
- Export jobs with downloadable archive parts and an offline viewer
- Firebase authentication with email/password and Google sign-in under one Firebase-enabled Google Cloud project
- Optional Stripe billing, browser push, SMTP delivery, and transcription providers
- Capacitor Android wrapper that loads the hosted app and exposes folder sync on-device
- Admin health combines live checks for MongoDB and Gemini with lighter configuration checks for R2 and transcription providers
