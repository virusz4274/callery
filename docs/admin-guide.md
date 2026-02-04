# Admin Guide

This guide explains the features available in the Admin Dashboard and operational tools.

## Accessing the Admin Panel

Navigate to `/admin` to access the dashboard. This route is protected and requires a user account with the `admin` role.

### Dashboard Overview
The dashboard provides a high-level view of system health:
*   **System Stats**: Total users, recordings, and storage usage.
*   **Orphaned Recordings**: Counts of files in R2 storage that do not have corresponding MongoDB entries.

## File Browser
Located at `/files`.

A visual interface to explore the Cloudflare R2 storage bucket.
*   **Navigation**: Browse folders organized by `Contact -> Year -> Month`.
*   **Management**: View file details and download recordings directly.

## Manual Upload
Located at `/upload`.

Allows administrators (and users) to manually upload recording files.
*   **Process**:
    1.  Select file.
    2.  System processes upload server-side.
    3.  File is stored in Cloudflare R2.
    4.  System triggers post-processing (transcription/summarization).

## Management Actions

### Announcements
Manage system-wide announcements shown to users.

### User Plans
Manage user subscription tiers and limits.
*   **Available Plans**:
    *   **Free Trial**: Default for new users (30 days).
    *   **Standard ($10/mo)**: Regular usage (2GB Storage).
    *   **Pro ($20/mo)**: Power users (5GB Storage).
    *   **Lifetime ($299)**: Pay-as-you-go model (0 limits, metered billing).
*   **Actions**:
    *   Create/Update Plans.
    *   Sync Plans to Stripe (if enabled).

### Maintenance Mode
Toggle **Maintenance Mode** in the settings. When active, non-admin users will see a maintenance page and cannot access the application.

## Audit Logs
Located at `/admin/logs` (if implemented in UI).

Tracks critical actions performed by administrators for security and accountability.
*   **Actions Logged**: User bans, plan changes, setting updates, etc.
*   **Data Stored**: Admin ID, timestamp, and details of the change.

## System Limits
*   **Max File Upload Size**: 2GB (Configured in `next.config.ts`).
*   **Timeout**: Varies by host (Vercel has 60s timeout for Server Actions).

## CLI Utility Scripts

The `scripts/` directory contains several tools for system administration and debugging. Run these using `npx tsx scripts/<script-name>.ts`.

*   **`check-db.ts`**: Verifies MongoDB connection and lists collections/indexes.
*   **`verify_plans_and_usage.ts`**: Audits user plans against Stripe subscriptions and recalculates usage stats.
*   **`fix-speaker-ids.ts`**: Repairs speaker ID data in transcripts if corrupted.
*   **`debug-contacts.ts`**: Helper to debug Google Contact sync issues for a specific user.
*   **`debug-transcripts.ts`**: Inspects raw transcript data for a recording.
*   **`test-recording.ts`**: Simulates a recording upload flow.

