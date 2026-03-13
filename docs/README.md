# Documentation Index

This folder contains the maintained project documentation for Call Memo.

Call Memo is primarily a call-recording archive and retrieval product. The main goal is to help users move recordings out of messy phone or desktop folders, keep the original audio together with transcript context, and find important calls again later through search and organization.

## Start Here

- [Setup Guide](setup-guide.md): Local setup, required services, environment variables, webhooks, and production cron configuration.
- [User Guide](user-guide.md): How end users import recordings, search the archive, review transcripts, export organized archives, and use support/settings.
- [Admin Guide](admin-guide.md): Admin routes, health checks, plans, announcements, audit logs, and maintenance tasks.
- [Full Application Test Plan](full-application-test-plan.md): Manual QA handoff for staging/prod-like validation across the whole product.

## Developer Reference

- [Architecture](architecture.md): System design, request flow, repository layout, and integration boundaries.
- [API Reference](api-reference.md): Main Server Actions, API routes, and webhook behavior.
- [Data Model](data-model.md): MongoDB collections, core document fields, and lifecycle notes.
- [Billing](billing.md): Seeded plans, Stripe setup, usage reporting, and validation checks.
- [Android App](android-app.md): Capacitor wrapper workflow and Android-specific development notes.

## Current Product Shape

- Next.js 16 App Router app with React 19 and Tailwind v4.
- Direct client-to-R2 uploads with presigned PUT URLs.
- Organized call archive with transcript, summary, speaker labels, timestamps, and semantic search.
- Structured exports with an offline viewer for recordings and transcripts.
- Firebase authentication with email/password and Google sign-in.
- Optional Google Contacts sync through Google People API.
- Optional billing, web push, SMTP support, Soniox, ElevenLabs, and Gemini integrations.
- Capacitor Android wrapper that loads the hosted web app.
