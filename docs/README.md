# Documentation Index

This folder contains the maintained project documentation for Call Memo.

## Start Here

- [Setup Guide](setup-guide.md): Local setup, required services, environment variables, webhooks, and production cron configuration.
- [User Guide](user-guide.md): How end users work with recordings, contacts, files, sharing, settings, and support.
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
- Firebase authentication with email/password and Google sign-in.
- Optional Google Contacts sync through Google People API.
- Optional billing, web push, SMTP support, Soniox, ElevenLabs, and Gemini integrations.
- Capacitor Android wrapper that loads the hosted web app.
