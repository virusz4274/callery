# Admin Guide

This guide explains the features available in the Admin Dashboard and operational tools.

## Accessing the Admin Panel

Navigate to `/admin` to access the dashboard. This route is protected and requires a user account with the `admin` role.

### Dashboard Overview
The dashboard provides a high-level view of system health:
*   **System Stats**: Total users, recordings, and storage usage.
*   **Orphaned Recordings**: Counts of files in R2 storage that do not have corresponding MongoDB entries.
*   **Service Status**: Real-time health checks for MongoDB, Cloudflare R2, Google Gemini, Soniox, and ElevenLabs.

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
    *   Create/Update Plans.
    *   Sync Plans to Stripe (if enabled).

### Transcription Billing
Manage cost multipliers for different transcription providers.
*   **Purpose**: Adjust billing rates based on provider costs (e.g., ElevenLabs is more expensive).
*   **Multipliers**:
    *   **Soniox**: Default 1.0x (Standard rate).
    *   **ElevenLabs**: Default 6.0x (Premium rate).
*   **Effect**: A 10-minute call transcribed with ElevenLabs (6x) will deduct **60 minutes** from the user's quota or be billed as 60 minutes of usage.

### Usage Adjustment (Forgiveness)
Admins can manually adjust a user's `storageUsed` or `transcriptionUsed` values from the User Detail view.
*   **Purpose**: Resolve accidental overages or grant credits without Stripe complications.
*   **Effect**: Reducing usage prevents Stripe from billing for that amount at the end of the month.

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
*   **`fix-speaker-ids.ts`**: Repairs speaker ID data in transcripts if corrupted.
*   **`debug-contacts.ts`**: Helper to debug Google Contact sync issues for a specific user.
*   **`debug-transcripts.ts`**: Inspects raw transcript data for a recording.
*   **`test-recording.ts`**: Simulates a recording upload flow.

