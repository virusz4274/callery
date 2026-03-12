# Documentation Index

This folder contains the maintained project documentation for Call Memo.

## Start Here

- [Setup Guide](setup-guide.md): Full handoff setup guide (Google Cloud, Firebase, R2, Stripe, webhooks, cron).
- [User Guide](user-guide.md): Product usage for end users.
- [Admin Guide](admin-guide.md): Admin dashboard and operations.

## Developer Reference

- [Architecture](architecture.md): System design and repository layout.
- [Data Model](data-model.md): MongoDB collections and relationships.
- [API Reference](api-reference.md): Server Actions and API routes.
- [Billing](billing.md): Stripe setup, plan logic, and billing validation checks.
- [Android App](android-app.md): Capacitor Android sync workflow.

## Notes

- Historical migration notes and one-off reports were removed.
- Setup steps were consolidated into `setup-guide.md` and `billing.md` for simpler handoff.
- Uploads use direct client-to-R2 flow with presigned PUT URLs.
- Upload limit is 5 GiB per recording and transcription limit is 2 GiB per recording.
- Cloudflare CORS setup for direct uploads is documented in `setup-guide.md` section `4. Cloudflare R2 Setup`.
