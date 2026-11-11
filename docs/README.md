# Documentation Index

This folder contains the maintained documentation for the current Callery codebase.
The maintained guides were checked against repository source on 2026-11-03.
Runtime verification and remaining deployment checks are recorded in [Releases](releases.md).

## Start Here

- [Setup Guide](setup-guide.md): step-by-step local setup, environment variables, service wiring (Better Auth, R2, Stripe, transcription providers, push, SMTP), and first-login admin bootstrap
- [User Guide](user-guide.md): end-user workflow across recordings, contacts, files, sharing, settings, support, and the web PWA
- [Small Team Setup and Recovery](small-team-setup.md): self-host company archives, invitations, access removal, and complete deployment backups
- [Transcription Batches](transcription-batches.md): bulk imports, saved batches, processing limits, and failure recovery
- [Admin Guide](admin-guide.md): admin routes, company access, health checks, incidents, plans, announcements, and operator runbook
- [Releases](releases.md): free self-host/paid managed scope, isolated Docker/SMTP/restore gates, source releases and known limits

## Developer Reference

- [AI Agent Integration Plan](ai-agent-integration-plan.md): draft plan for public ChatGPT, remote MCP, OAuth, agent search, uploads, and other AI clients
- [Dependency Review](dependency-review.md): current toolchain, security fixes, compatibility decisions and upgrade checks
- [Architecture](architecture.md): system shape, async flows, security boundaries, and repository layout
- [API Reference](api-reference.md): Server Actions, route handlers, signed upload flow, webhooks, and cron endpoints
- [Integration API](integration-api.md): scoped tokens, recording uploads/downloads, transcription, and client examples
- [AI Assistant Connections](mcp-platforms.md): remote MCP, OAuth, client setup, platform acceptance, and public listing preparation
- [Recording Filenames](recording-filenames.md): supported recorder patterns and validated contact/date metadata
- [Data Model](data-model.md): MongoDB collections, important document fields, and index/TTL notes
- [Billing](billing.md): seeded plans, complete Stripe configuration walkthrough, overage accounting, access control matrix, and troubleshooting
- [Cron Jobs](cron-jobs.md): background job schedule, authorization, and operational notes
- [Android App](android-app.md): archived native work and retained upload/sync APIs

## Product Snapshot

- Next.js 16 App Router app with React 19 and Tailwind v4
- Upload sessions with signed completion tokens, using direct S3-compatible uploads or bounded app streaming according to deployment configuration
- Recording archive with transcripts, summaries, contact matching, and semantic search support
- Google Contacts sync plus contact-linked recording history
- Export jobs with downloadable archive parts and an offline viewer
- Better Auth authentication backed by MongoDB in every deployment
- Optional Stripe billing, browser push, SMTP delivery, and transcription providers
- Archived Android wrapper; reusable upload/sync APIs remain for a future client
- Admin health pings MongoDB and checks the S3 bucket with `HeadBucket`; AI and transcription checks inspect configuration without paid provider calls

## Historical Records

- [Branch Reconciliation — October 5, 2026](branch-reconciliation.md): archived integration inputs and recovery references; implementation and verification notes are superseded by the maintained guides above.
