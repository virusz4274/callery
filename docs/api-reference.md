# API & Server Actions Reference

This document describes the key API endpoints and Server Actions available in the application. All API routes are located in `src/app/api` and Server Actions in `src/app/actions`.

## Server Actions (`src/app/actions`)

The application favors Server Actions for mutations and data fetching in Server Components.

### **Uploads & Recordings**
*   `upload-recordings.ts`:
    *   `uploadRecordings`: Handles server-side file upload to R2, creates metadata in MongoDB, and triggers background transcription/summarization.
*   `delete-recordings.ts`: Handles deletion of recording metadata and R2 files.
*   `search-actions.ts`:
    *   `searchRecordingsAction`: Performs semantic vector search on recording summaries.
*   `export.ts`:
    *   `startExport`: Triggers a background job to archive all user data (Recordings + Transcripts).
    *   `getExportStatus`: Polls the status of the active export job.
*   `sharing.ts`:
    *   `createShareLink`: Generates a secure, time-limited public sharing link for a recording.

### **Notifications & System**
*   `notifications.ts`:
    *   `fetchNotifications`: Gets recent alerts for the user.
    *   `readNotification` / `readAllNotifications`: Marks alerts as read.
    *   `clearAllNotifications`: Deletes all history.
*   `notifications.ts` (Admin):
    *   `sendTestNotification`: Dev tool for testing.

### **Admin**
*   `admin.ts`: System-wide statistics.
*   `admin-plans.ts`: Manage user subscription plans.
*   `admin-health.ts`:
    *   `checkSystemHealth`: Diagnostic tool to verify connectivity to MongoDB, R2, Gemini, and Soniox.
*   `admin-announcements.ts`:
    *   `getAnnouncements`: List all system announcements.
    *   `createAnnouncement` / `updateAnnouncement` / `deleteAnnouncement`: CRUD for global banners.
*   `audit-log.ts`: Admin action logging.
*   `update-contact-plan.ts`:
    *   `updateContactPlan`: Manually assign a plan to a user (Admin only).

### **Contacts & Plans**
*   `save-contacts.ts`: CRUD for contacts.
*   `google-auth.ts`: Google People API integration.
*   `plans.ts`:
    *   `getPublishedPlans`: Fetches active plans for the pricing page.

---

## API Routes (`src/app/api`)

## Authentication

### `POST /api/auth/session`
Creates or verifies a session cookie based on the Firebase ID token.
*   **Body**: `{ idToken: string }`

## Recordings

### `GET /api/recordings`
Fetches a list of recordings for the authenticated user with standard filtering and sorting.
*   **Query Params**:
    *   `limit` (default: 100)
    *   `page` (default: 1)
    *   `sortBy` (`date` | `duration`)
    *   `sortOrder` (`asc` | `desc`)
    *   `contactName`, `startDate`, `endDate`, `includeArchived`
*   **Response**: `RecordingResponse[]`

### `GET /api/recordings/[id]`
Fetches details of a specific recording.

### `GET /api/recordings/[id]/play`
Generates a temporary signed URL for streaming audio from Cloudflare R2.
*   **Response**: `{ playbackUrl: string, expiresAt: number }`
*   **Security**: Validates ownership before signing. URL expires in 1 hour.

### `DELETE /api/recordings/[id]`
Deletes a recording and its associated file from Cloudflare R2.

## Uploads

*Moved to Server Action: `upload-recordings.ts`*

## Contacts

### `GET /api/contacts`
Fetches a list of contacts.
*   **Query Params**: `limit`, `skip`.

## Users

### `GET /api/user/profile`
Fetches the current user's profile and settings.
*   **Response**: `UserResponse` object.
    *   `billingSettings`: `{ allowOverage: boolean }`
    *   `stripeSubscriptionStatus`: Current Stripe status.
    *   `storageUsed` / `storageAllocation`: Usage stats.
    *   `trialEndsAt`: Date string.

### `PATCH /api/user/profile`
Updates user settings.
*   **Body**: `UpdateUserInput` (e.g., `firstName`, `lastName`, `timezone`).

### `POST /api/user/ensure-profile`
Ensures a user profile exists in MongoDB. Called after Firebase Auth login.
*   **Body**: `{ firebaseUid, email, displayName, firstName, lastName }`

### `PATCH /api/user/billing-settings`
Toggles "Pay Per Usage" (Overage) settings.
*   **Body**: `{ allowOverage: boolean }`
*   **Notes**: Triggers immediate usage reporting to Stripe if enabled. Fails for Free Tier users.

## Filesystem

### `GET /api/filesystem`
Returns a hierarchical file tree structure of the user's recordings, organized by Contact -> Year -> Month.
*   **Response**: `FileSystemNode` tree.

## Transcription

### `POST /api/transcribe`
Manually triggers background transcription and summarization for an existing recording. Useful for retries or if auto-transcribe is disabled.
*   **Body**: `{ recordingId: string }`
*   **Note**: Uses Next.js `after()` for background processing. Returns `processing` status immediately. Enforces billing/limits.

## Statistics

### `GET /api/stats`
Fetches dashboard statistics for the authenticated user.
*   **Response**: `DashboardStats` object.
    *   `totalRecordings`: Total number of calls.
    *   `totalDuration`: Total duration in seconds.
    *   `recentActivity`: List of recent actions/uploads.
    *   `storageUsed`: Current storage usage in bytes.

## Billing (Stripe)

### `POST /api/stripe/webhook`
Handles asynchronous events from Stripe.
*   **Events Handled**:
    *   `checkout.session.completed`: Upgrades user plan after successful payment.
    *   `invoice.payment_succeeded`: Process subscription renewals.
    *   `customer.subscription.updated`: Syncs status changes (cancellations, etc.).
    *   `customer.subscription.deleted`: Downgrades user to free plan.

### `POST /api/stripe/checkout`
Creates a Stripe Checkout session for subscription upgrades.
*   **Body**: `{ priceId: string }`
*   **Response**: `{ url: string }` (Redirect URL to Stripe)

### `POST /api/stripe/portal`
Creates a Billing Portal session for users to manage their subscription.
*   **Response**: `{ url: string }` (Redirect URL to Stripe)

---

## Client-Side Utilities (`src/lib/api-client.ts`)

For frontend components making requests to API routes, use the following utilities to handle authentication automatically.

### `authFetch(url, options)`
A wrapper around the native `fetch` API that automatically injects the Firebase ID token into the `Authorization` header.

### `authFetchJson<T>(url, options)`
Fetches from the API and parses the response as JSON. Throws a structured `ApiError` for non-2xx responses.

### `handleApiResponse<T>(response)`
Standardized error handling for API responses. Parses error messages from the JSON body if available.
