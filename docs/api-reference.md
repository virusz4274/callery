# API & Server Actions Reference

This document describes the key API endpoints and Server Actions available in the application. All API routes are located in `src/app/api` and Server Actions in `src/app/actions`.

## Server Actions (`src/app/actions`)

The application favors Server Actions for mutations and data fetching in Server Components and Client Components. All actions are validated using Zod schemas.

### **Recordings (`recordings.ts`)**
*   **`getRecordingsAction(options: GetRecordingsOptions)`**:
    *   Fetches a list of recordings for the authenticated user.
    *   **Input**: `{ page?: number, limit?: number, search?: string, contactId?: string, ... }`
    *   **Returns**: `{ recordings: Recording[], totalCount: number, ... }`
*   **`deleteRecordingAction(id: string)`**:
    *   Deletes a recording and its associated file from Cloudflare R2 and MongoDB.
    *   **Input**: `id` (UUID string).
*   **`updateRecordingAction(id: string, data: UpdateRecordingInput)`**:
    *   Updates recording metadata (tags, starred status, contact association).
    *   **Input**: `id`, `{ isStarred?, tags?, contactId? }`.
*   **`getPlaybackUrlAction(id: string)`**:
    *   Generates a temporary signed URL for streaming audio from Cloudflare R2.
    *   **Input**: `id` (UUID string).
    *   **Returns**: `{ playbackUrl: string }`.

### **Transcription (`transcription.ts`)**
*   **`transcribeRecordingAction(input: { recordingId: string })`**:
    *   Manually triggers background transcription and summarization for a recording.
    *   **Input**: `{ recordingId: string }`.
    *   **Note**: Uses Next.js `after()` for background processing. Returns `{ success: true }` immediately if job starts.

### **Statistics (`stats.ts`)**
*   **`getStatsAction()`**:
    *   Fetches dashboard statistics for the authenticated user.
    *   **Returns**: `{ totalRecordings, totalDuration, recentActivity, storageUsed }`.

### **Other Actions**
*   **`upload-recordings.ts`**:
    *   `uploadRecordings`: Handles server-side file upload to R2, creates metadata, and triggers processing.
*   **`export.ts`**:
    *   `startExport`: Enqueues a new export job for the authenticated user.
    *   `getExportStatus`: Returns latest export job status/progress/download links.
*   **`search-actions.ts`**:
    *   `searchRecordingsAction`: Performs semantic vector search.
*   **`contact-actions.ts`** (and others):
    *   Various actions for contact management, admin tasks, and system health checks.

---

## API Routes (`src/app/api`)

API routes are primarily used for **Webhooks** and **Authentication** interactions that require standard HTTP endpoints.

### **Authentication**
*   **`POST /api/auth/session`**: Creates/Verifies a session cookie based on Firebase ID token.
*   **`GET /api/auth/logout`**: Clears the session cookie.

### **Webhooks**
*   **`POST /api/webhooks/soniox`**: Receives transcription completion events from Soniox.
*   **`POST /api/webhooks/elevenlabs`**: Receives transcription completion events from ElevenLabs.
*   **`POST /api/stripe/webhook`**: Handles Stripe billing events (Subscription updates, Invoice payments).

### **User & Contacts**
*   **`GET /api/user/profile`**: Fetches user profile and billing status.
*   **`GET /api/contacts`**: Fetches user contacts (Legacy/Hybrid use).
*   **`GET /api/filesystem`**: Returns file tree structure for the File Browser.

### **Cron / Background Workers**
All cron endpoints require:
`Authorization: Bearer <CRON_SECRET>`

*   **`GET /api/cron/process-exports`**:
    *   Claims one pending (or stale processing) export job and runs the export worker.
    *   Intended to run on a short interval (e.g., every 5 minutes).
*   **`GET /api/cron/cleanup-recordings`**:
    *   Deletes recordings that exceed each user's configured retention policy.
    *   Intended to run daily.

### **Files (Legacy/Direct Access)**
*   *Legacy `GET /api/recordings/*` routes have been removed in favor of Server Actions.*
