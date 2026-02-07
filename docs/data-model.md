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
| `photoURL` | `string` | (Optional) Profile picture URL. |
| `role` | `'user' \| 'admin'` | User role. |
| `plan` | `string` | Subscription plan name. |
| `disabled` | `boolean` | (Optional) Account disabled status. |
| `timezone` | `string` | User's preferred timezone. |
| `storageUsed` | `number` | Storage used in bytes. |
| `storageAllocation` | `number` | Storage limit in bytes. |
| `storagePeakUsed` | `number` | Peak stored bytes for the current billing period. |
| `storagePeakPeriodEnd` | `Date` | Billing period end associated with `storagePeakUsed`. |
| `transcriptionUsed` | `number` | Transcription used in seconds. |
| `transcriptionAllocation` | `number` | Transcription limit in seconds. |
| `totalContacts` | `number` | Total number of contacts. |
| `totalRecordings` | `number` | Total number of recordings. |
| `totalDuration` | `number` | Total duration of all recordings. |
| `stripeCustomerId` | `string` | Stripe Customer ID. |
| `stripeSubscriptionId` | `string` | Stripe Subscription ID. |
| `stripePriceId` | `string` | Current Stripe Price ID. |
| `stripeSubscriptionStatus` | `string` | Stripe status (active, past_due, etc.). |
| `stripeCurrentPeriodEnd` | `Date` | End of current Stripe billing period. |
| `trialEndsAt` | `Date` | Timestamp when free trial expires. |
| `lastLoginAt` | `Date` | Last login timestamp. |
| `createdAt` | `Date` | Account creation timestamp. |
| `updatedAt` | `Date` | Last update timestamp. |

**Settings Fields:**
```typescript
notificationSettings: {
    activityDigest: 'off' | 'weekly' | 'monthly';
    ingestSuccess: boolean;
    ingestFail: boolean;
}
billingSettings: {
    allowOverage: boolean; // "Pay Per Usage" toggle
}
storageSettings: {
    deletionPolicy: 'never' | '3m' | '6m' | '1y';
}
transcriptionSettings: {
    autoTranscribe: boolean;
}
```

---

### **`plans`**
Stores subscription plan definitions.

| Field | Type | Description |
| :--- | :--- | :--- |
| `_id` | `ObjectId` | Unique identifier. |
| `name` | `string` | Plan name (e.g., "Free Trial", "Pro"). |
| `description` | `string` | (Optional) Brief plan description. |
| `price` | `number` | Cost in cents/units. |
| `currency` | `string` | Currency code (e.g., 'USD'). |
| `interval` | `'monthly' \| 'yearly' \| 'lifetime'` | Billing interval. |
| `limits` | `object` | `{ storage: number, transcription: number }` |
| `stripePriceId` | `string` | Stripe Price ID for base plan. |
| `stripeStoragePriceId` | `string` | Stripe Price ID for Metered Storage. |
| `stripeTranscriptionPriceId` | `string` | Stripe Price ID for Metered Transcription. |
| `features` | `string[]` | List of features for UI display. |
| `isDefault` | `boolean` | Whether this is the default plan. |
| `isActive` | `boolean` | Whether the plan is currently available. |
| `createdAt` | `Date` | Creation timestamp. |
| `updatedAt` | `Date` | Last update timestamp. |

---

### **`recordings`**
Stores metadata for audio recordings.

| Field | Type | Description |
| :--- | :--- | :--- |
| `_id` | `ObjectId` | Unique identifier. |
| `firebaseUid` | `string` | Reference to the owner (Firebase UID). |
| `contactId` | `ObjectId` | Reference to `contacts` collection (optional). |
| `contactName` | `string` | Cached contact name. |
| `phoneNumber` | `string` | Phone number associated with the call. |
| `r2Key` | `string` | Key/Path in Cloudflare R2 storage. |
| `fileName` | `string` | Original file name. |
| `fileSize` | `number` | Size of file in bytes. |
| `mimeType` | `string` | MIME type of file. |
| `duration` | `number` | Duration in seconds. |
| `standardizedDisplayName` | `string` | (Optional) Cached display name for UI. |
| `transcriptionStatus` | `'pending' \| 'processing' \| 'completed' \| 'failed'` | Current status of transcription. |
| `languageCode` | `string` | Language code (e.g., 'en-US'). |
| `summary` | `string` | AI-generated summary of the call. |
| `summaryEmbedding` | `number[]` | Vector embedding of the summary. |
| `transcriptEmbedding` | `number[]` | (Deprecated) Vector embedding of transcript. |
| `transliteratedTranscript` | `string` | (Optional) Transliterated text (e.g., Manglish). |
| `translatedTranscript` | `string` | (Optional) Translated text (e.g., English). |
| `additionalTranscriptions` | `object` | Flexible bucket for other variations. |
| `tags` | `string[]` | Array of tags. |
| `isStarred` | `boolean` | Starred status. |
| `isArchived` | `boolean` | Archived status. |
| `recordedAt` | `Date` | Date the call took place. |
| `createdAt` | `Date` | Date the record was created. |
| `updatedAt` | `Date` | Last update timestamp. |

**Transcript Structure:**
```typescript
fullTranscript: {
    speakerId: string;
    text: string;
    start?: number;
    end?: number;
    words: {
        text: string;
        start?: number;
        end?: number;
        speakerId?: string;
        confidence?: number;
    }[];
    transliteratedText?: string;
}[]
```

---

### **`contacts`**
Stores contact information synced from Google Contacts or manually added.

| Field | Type | Description |
| :--- | :--- | :--- |
| `_id` | `ObjectId` | Unique identifier. |
| `firebaseUid` | `string` | Owner reference (Firebase UID). |
| `googleContactId` | `string` | ID from Google People API. |
| `name` | `string` | Contact's full name. |
| `phoneNumbers` | `string[]` | List of phone numbers. |
| `email` | `string` | Contact's email. |
| `firstName` | `string` | First name. |
| `lastName` | `string` | Last name. |
| `jobTitle` | `string` | Job title. |
| `company` | `string` | Company name. |
| `totalRecordings` | `number` | Cache of total recordings with this contact. |
| `lastRecordingAt` | `Date` | Timestamp of the last conversation. |
| `createdAt` | `Date` | Creation timestamp. |
| `updatedAt` | `Date` | Last update timestamp. |

---

### **`system_settings`**
Singleton document for global system configuration.

| Field | Type | Description |
| :--- | :--- | :--- |
| `_id` | `ObjectId` | Unique identifier. |
| `allowSignups` | `boolean` | Toggle to allow/block new signups. |
| `maintenanceMode` | `boolean` | Toggle maintenance mode. |
| `defaultPlanId` | `ObjectId` | Reference to the default plan for new users. |
| `updatedAt` | `Date` | Last update timestamp. |

---

### **`announcements`**
System-wide announcements.

| Field | Type | Description |
| :--- | :--- | :--- |
| `_id` | `ObjectId` | Unique identifier. |
| `title` | `string` | Announcement title. |
| `message` | `string` | Announcement body content. |
| `type` | `'info' \| 'warning' \| 'alert' \| 'success'` | Visual type. |
| `isActive` | `boolean` | Whether the announcement is currently active. |
| `startDate` | `Date` | Start date to display. |
| `endDate` | `Date` | (Optional) End date. |
| `createdBy` | `ObjectId` | Admin ID who created it. |
| `createdAt` | `Date` | Creation timestamp. |

---

### **`notifications`**
In-app user notifications and alerts.

| Field | Type | Description |
| :--- | :--- | :--- |
| `_id` | `ObjectId` | Unique identifier. |
| `userId` | `ObjectId` | Reference to the recipient user. |
| `type` | `'info' \| 'success' \| 'warning' \| 'error'` | Notification type. |
| `title` | `string` | Short title. |
| `message` | `string` | Detailed message. |
| `isRead` | `boolean` | Read status. |
| `link` | `string` | (Optional) Action link. |
| `createdAt` | `Date` | Creation timestamp. |

---

### **`admin_logs`**
Audit trail for admin actions.

| Field | Type | Description |
| :--- | :--- | :--- |
| `_id` | `ObjectId` | Unique identifier. |
| `adminId` | `string` | ID of the admin who performed the action. |
| `adminEmail` | `string` | Cached email of the admin. |
| `action` | `string` | Action type (e.g., "USER_BAN", "PLAN_UPDATE"). |
| `targetId` | `string` | (Optional) ID of the affected resource. |
| `targetType` | `string` | (Optional) Type of affected resource. |
| `details` | `object` | Snapshot of changes or arguments. |
| `ipAddress` | `string` | (Optional) IP address. |
| `createdAt` | `Date` | Creation timestamp. |

---

### **`export_jobs`**
Tracks background data export tasks.

| Field | Type | Description |
| :--- | :--- | :--- |
| `_id` | `ObjectId` | Unique identifier. |
| `firebaseUid` | `string` | User reference. |
| `status` | `'pending' \| 'processing' \| 'completed' \| 'failed'` | Job status. |
| `progress` | `number` | Progress (0-100). |
| `totalRecordings` | `number` | Total items to process. |
| `processedRecordings` | `number` | Items completed so far. |
| `parts` | `Array` | List of generated archive parts `{ key, size, url }`. |
| `error` | `string` | Error message if failed. |
| `createdAt` | `Date` | Creation timestamp. |
| `updatedAt` | `Date` | Last update timestamp. |

## Relationships

*   **User -> Plans**: Reference by `plan` name or dynamic lookup.
*   **User -> Recordings**: One-to-Many (via `firebaseUid`).
*   **User -> Contacts**: One-to-Many (via `firebaseUid`).
*   **Contact -> Recordings**: One-to-Many (via `contactId`).

## Indexes

*   `users`: `firebaseUid` (unique), `email`.
*   `plans`: `name` (unique).
*   `recordings`: `firebaseUid`, `contactId`, `recordedAt`, `r2Key`.
*   `contacts`: `firebaseUid`, `phoneNumbers` (unique per user), `name` (text).
*   `admin_logs`: `createdAt` (desc), `adminId`, `action`.
