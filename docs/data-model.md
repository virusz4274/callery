# Data Model

This document outlines the MongoDB data model used in the application.

## Collections

### **`users`**
Stores user profile information and settings.

| Field | Type | Description |
| :--- | :--- | :--- |
| `_id` | `ObjectId` | Unique identifier. |
| `firebaseUid` | `string` | Link to Firebase Auth user. |
| `email` | `string` | User's email address. |
| `firstName` | `string` | First name. |
| `lastName` | `string` | Last name. |
| `name` | `string` | Full name (computed or stored). |
| `phoneNumber` | `string` | User's primary phone number. |
| `role` | `'user' \| 'admin'` | User role. |
| `plan` | `'Free' \| 'Pro'` | Subscription plan. |
| `timezone` | `string` | User's preferred timezone. |
| `storageUsed` | `number` | Storage used in bytes. |
| `storageAllocation` | `number` | Storage limit in bytes. |
| `transcriptionUsed` | `number` | Transcription used in seconds. |
| `transcriptionAllocation` | `number` | Transcription limit in seconds. |
| `stripeSubscriptionStatus` | `string` | Stripe status (active, past_due, etc.). |
| `trialEndsAt` | `Date` | Timestamp when free trial expires. |
| `createdAt` | `Date` | Account creation timestamp. |
| `updatedAt` | `Date` | Last update timestamp. |

**Settings Fields:**
```typescript
notificationSettings: {
    activityDigest: 'off' | 'weekly' | 'monthly';
}
billingSettings: {
    allowOverage: boolean; // "Pay Per Usage" toggle
}
```

---

### **`plans`**
Stores subscription plan definitions.

| Field | Type | Description |
| :--- | :--- | :--- |
| `_id` | `ObjectId` | Unique identifier. |
| `name` | `string` | Plan name (e.g., "Free Trial", "Pro"). |
| `price` | `number` | Cost in cents/units. |
| `limits` | `object` | `{ storage: number, transcription: number }` |
| `stripePriceId` | `string` | Stripe Price ID for base plan. |
| `stripeStoragePriceId` | `string` | Stripe Price ID for Metered Storage. |
| `stripeTranscriptionPriceId` | `string` | Stripe Price ID for Metered Transcription. |
| `features` | `string[]` | List of features for UI display. |

---

### **`recordings`**
Stores metadata for audio recordings.

| Field | Type | Description |
| :--- | :--- | :--- |
| `_id` | `ObjectId` | Unique identifier. |
| `userId` | `string` | Reference to the owner (Firebase UID). |
| `contactId` | `ObjectId` | Reference to `contacts` collection (optional). |
| `contactName` | `string` | Cached contact name. |
| `phoneNumber` | `string` | Phone number associated with the call. |
| `r2Key` | `string` | Key/Path in Cloudflare R2 storage. |
| `fileName` | `string` | Original file name. |
| `duration` | `number` | Duration in seconds. |
| `transcriptionStatus` | `'pending' \| 'processing' \| 'completed' \| 'failed'` | Current status of transcription. |
| `summary` | `string` | AI-generated summary of the call. |
| `recordedAt` | `Date` | Date the call took place. |
| `createdAt` | `Date` | Date the record was created. |

**Transcript Structure:**
```typescript
fullTranscript: {
    speakerId: string;
    text: string;
    start: number;
    end: number;
    words: {
        text: string;
        start: number;
        end: number;
        speaker_id: string;
    }[];
}[]
```

---

### **`contacts`**
Stores contact information synced from Google Contacts or manually added.

| Field | Type | Description |
| :--- | :--- | :--- |
| `_id` | `ObjectId` | Unique identifier. |
| `userId` | `string` | Owner reference (Firebase UID). |
| `googleContactId` | `string` | ID from Google People API. |
| `name` | `string` | Contact's full name. |
| `phoneNumbers` | `string[]` | List of phone numbers. |
| `email` | `string` | Contact's email. |
| `totalRecordings` | `number` | Cache of total recordings with this contact. |
| `lastRecordingAt` | `Date` | Timestamp of the last conversation. |

## Relationships

*   **User -> Plans**: Loose coupling via `plan` name string (or `planId` if migrated).
*   **User -> Recordings**: One-to-Many (via `userId`).
*   **User -> Contacts**: One-to-Many (via `userId`).
*   **Contact -> Recordings**: One-to-Many (via `contactId`).

## Indexes

*   `users`: `firebaseUid` (unique), `email` (unique).
*   `plans`: `name` (unique).
*   `recordings`: `userId`, `contactId`, `recordedAt`, `r2Key`.
*   `contacts`: `userId`, `phoneNumbers`, `name` (text index for search).
