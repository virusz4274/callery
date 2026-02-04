# User Guide

Welcome to **CallOrganizer**! This guide explains how to use the application to manage your call recordings and contacts.

## 1. Getting Started

### Authentication
*   **Sign In**: Use your **Google Account** or **Email/Password**.
*   **Profile**: On first login, your profile is created. Go to settings to update your name.

## 2. Managing Recordings

### Uploading Calls
1.  Navigate to the **Upload** page.
2.  Drag and drop audio files (MP3, M4A, WAV) or click to browse.
3.  **Maximum Size**: 2GB per file.
4.  Once uploaded, files are automatically processed for:
    *   **Transcription** (Speech-to-Text).
    *   **Diarization** (Distinguishing speakers).
    *   **Summarization** (AI-generated summary).

### Playing & Viewing
*   Click any recording in the dashboard to open the **Detail View**.
*   **Player**: Use the audio player to listen.
*   **Transcript**: Read the synchronized transcript. Click any sentence to jump to that point in the audio.
*   **Search**: Use the search bar inside the transcript to find specific keywords.

### Semantic Search
The dashboard features **Semantic Search** powered by AI (Vector Embeddings).
*   **Concept Matching**: You don't need to match exact keywords.
*   *Example*: Searching for "pricing discussion" will find calls where money or quotes were discussed, even if the word "pricing" wasn't used.
*   **Search Bar**: Use the global search bar at the top of the Recordings Dashboard.

### Filtering
*   **Filters**: Filter by Date Range, Contact, or Duration.
*   **Tags**: Filter by manually applied tags.

### Sharing Recordings
You can securely share individual recordings with anyone, even if they don't have a VoSift account.
1.  Open the recording detail view.
2.  Click the **Share** button in the top header.
3.  Select an **expiration time** (1 Hour, 24 Hours, or 7 Days).
4.  Click **Generate Link**.
5.  Copy the link and send it.
    *   *Note*: The recipient gets a read-only view of the audio, transcript, and summary. They cannot edit or delete the file.

## 3. Contacts

### Google Sync
1.  Go to **Settings > General**.
2.  Click **Connect Google Contacts**.
3.  Grant permission.
4.  The app will import your contacts and display them in the **Contacts** tab.

### Linking Recordings
The system attempts to automatically link recordings to contacts based on phone numbers in the filename.
*   **Manual Link**: You can manually assign a contact to a recording from the recording's detail page.

## 4. Billing & Usage

### Plans
*   **Free Trial**: You have 30 days to test all features.
*   **Standard/Pro**: Monthly subscriptions with fixed storage/transcription limits.
*   **Lifetime**: Pay-as-you-go model.

### Overage (Pay Per Usage)
If enabled in **Settings > Billing**:
*   You can continue uploading even after hitting your plan's limit.
*   **Storage Cost**: You are billed monthly for the extra space used (e.g., storing 10GB on a 5GB plan incurs a 5GB charge *every month*).
*   **Transcription Cost**: You are billed a one-time fee for extra minutes transcribed.

## 5. Settings

### Profile
*   **Update Info**: Change your display name and time zone.
*   **Export**: Download a copy of your data (GDPR compliance).

### Billing Settings
*   **Manage Subscription**: View current plan, upgrade/downgrade, or cancel via the Stripe Customer Portal.
*   **Pay Per Usage (Overage)**:
    *   **Toggle On**: Allows you to upload/transcribe beyond your plan's included limits. You will be billed for the extra usage at the end of the month.
    *   **Toggle Off**: Strict limits are enforced. You cannot upload more files once your storage limit is reached.

### Notifications
*   **In-App Alerts**: Click the **Bell Icon** in the top navigation bar to view your notification history (e.g., "Transcription Ready").
*   **Email Alerts**: Configure digest frequency (Weekly/Monthly) and alerts for successful/failed uploads in the Settings page.
*   **Theme**: Toggle between Light and Dark mode.
