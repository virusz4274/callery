# API & Server Actions Reference

This document describes the key API endpoints and Server Actions available in the application. All API routes are located in `src/app/api` and Server Actions in `src/app/actions`.

## Server Actions (`src/app/actions`)

The application favors Server Actions for mutations and data fetching in Server Components.

### **Uploads & Recordings**
*   `upload-recordings.ts`:
    *   `getPresignedUrl`: Generates R2 upload URL.
    *   `processRecording`: Initiates transcription/summarization.
*   `delete-recordings.ts`: Handles deletion of recording metadata and R2 files.

### **Admin**
*   `admin.ts`: System-wide statistics.
*   `admin-plans.ts`: Manage user subscription plans.
*   `admin-announcements.ts`: System announcements.

### **Contacts**
*   `save-contacts.ts`: CRUD for contacts.
*   `google-auth.ts`: Google People API integration.

---

## API Routes (`src/app/api`)

## Authentication

### `POST /api/auth/session`
Creates or verifies a session cookie based on the Firebase ID token.
*   **Body**: `{ idToken: string }`

## Recordings

### `GET /api/recordings`
Fetches a list of recordings for the authenticated user.
*   **Query Params**:
    *   `limit` (default: 50)
    *   `offset` (default: 0)
    *   `search` (optional search term)
*   **Response**: `RecordingResponse[]`

### `GET /api/recordings/[id]`
Fetches details of a specific recording.

### `DELETE /api/recordings/[id]`
Deletes a recording and its associated file from Cloudflare R2.

### `POST /api/process/recording`
*Moved to Server Action: `upload-recordings.ts`*

## Uploads

*Moved to Server Action: `upload-recordings.ts`*

## Contacts

### `GET /api/contacts`
Fetches a list of contacts.
*   **Query Params**: `limit`, `skip`.

### `POST /api/contacts/sync`
*Moved to Server Action: `contacts.ts`*

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
Triggers background transcription and summarization for a specific recording.
*   **Body**: `{ recordingId: string }`
*   **Note**: Uses Next.js `after()` for background processing. Returns `processing` status immediately.

## Statistics

### `GET /api/stats`
Fetches dashboard statistics (total calls, duration, recent activity).


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
