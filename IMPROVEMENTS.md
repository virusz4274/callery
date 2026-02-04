# Application Improvements & Roadmap

This document outlines recommended features and improvements to enhance both the User and Admin experience, as well as technical robustness.

## 👤 User Perspective

### 1. Shareable Links
*   **Status**: ✅ **COMPLETED** (Feb 2026)
*   **Goal**: Turn the app from a personal vault into a collaboration tool.
*   **Implemented**:
    *   Secure, cryptographically signed JWT links.
    *   Configurable expiration (1 hour, 24 hours, 7 days).
    *   Read-only public view of Audio Player + Transcript + Summary.
    *   Copy-to-clipboard functionality.

### 2. Data Export / Takeout
*   **Goal**: Fulfill "Pro" plan promises and build trust (no vendor lock-in).
*   **Feature**: "Download My Data" button in Settings.
*   **Details**:
    *   Generates a `.zip` archive.
    *   Includes a CSV of metadata (Date, Contact, Duration, Tags).
    *   Includes individual `.txt` or `.json` files for transcripts and summaries.

### 3. In-App Notifications
*   **Status**: ⚠️ **PARTIALLY COMPLETED** (Feb 2026)
*   **Goal**: Keep users engaged during long processing times.
*   **Implemented**:
    *   **Notification Center**: Bell icon with unread badge and history list.
    *   **Toast Alerts**: Real-time popup alerts when tasks complete while using the app.
    *   **Backend Triggers**: Automated alerts for transcription success/failure.
*   **Pending**:
    *   Browser Push Notifications (requires Service Worker setup).

---

## 🛡️ Admin Perspective

### 1. User Impersonation ("Login As")
*   **Goal**: Debug user-reported issues instantly.
*   **Feature**: "Impersonate" button in the Admin User list.
*   **Details**:
    *   Creates a temporary, short-lived session cookie for the target user.
    *   Admin sees the app exactly as that user does.
    *   Audit log entry: "Admin X impersonated User Y".

### 2. Service Health Dashboard
*   **Goal**: Quick diagnostics of external dependencies.
*   **Feature**: Status indicators on the Admin Dashboard.
*   **Details**:
    *   Real-time pings to: Soniox API, Google Gemini, Cloudflare R2, and MongoDB.
    *   Display Latency and Up/Down status.

### 3. Usage Adjustment (Forgiveness)
*   **Goal**: Customer support tool for accidental overages.
*   **Feature**: Manual edit fields for `storageUsed` and `transcriptionUsed` in Admin User View.
*   **Details**:
    *   Allows Admins to credit back usage (e.g., subtract 500MB) if a user uploads a file by mistake.
    *   Prevents Stripe from billing for that specific overage at month's end.

---

## ⚙️ Technical & Security

### 1. Rate Limiting
*   **Goal**: Prevent abuse and financial DoS (Denial of Service).
*   **Feature**: API Rate Limiting.
*   **Details**:
    *   Limit `POST /upload` to X requests per hour per user.
    *   Implementation: Use `@vercel/kv` (Redis) or a sliding window counter in MongoDB.

### 2. "Soft" Delete (Trash Bin)
*   **Goal**: Recover accidentally deleted data.
*   **Feature**: Two-stage deletion.
*   **Details**:
    *   User clicks "Delete" -> Sets `deletedAt` timestamp (File remains in R2).
    *   UI shows "Trash" folder.
    *   Cron Job: Permanently deletes items where `deletedAt > 30 days`.
