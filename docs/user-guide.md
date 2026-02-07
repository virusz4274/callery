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

### File Browser
*   **Navigation**: Browse your uploaded files and folders in a hierarchical view.
*   **View Details**: 
    1.  Click the **Three Dots** (menu) icon on a file.
    2.  Select **View Details** to open a popup with the audio player, transcript, and AI summary.
*   **Delete**:
    1.  Click the **Three Dots** (menu) icon on a file.
    2.  Select **Delete** to permanently remove the recording and its transcripts.

### Playing & Viewing
*   Click any recording in the dashboard to open the **Detail View**.
*   **Player**: Use the audio player to listen.
*   **Transcript**: Read the synchronized transcript. Click any sentence to jump to that point in the audio.
*   **Transliteration**: Toggle between **Original** and **Transliteration** modes (if available) to view the transcript in a different script.
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
    *   **Secure Access**: The recipient gets a read-only view. No login required.
    *   **Features**: They can play audio, read user-friendly transcripts, and view the summary.

## 3. Contacts

### Google Sync
1.  Go to **Settings > Data**.
2.  Click **Connect** in the "Sync Google Contacts" section.
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

The settings area is organized into the following tabs:

### 👤 Profile
*   **Update Info**: Change your display name.
*   **Change Password**: Update your login credentials.

### ⚙️ General
*   **Timezone**: Set your preferred timezone for date displays.

### 💾 Data
*   **Google Sync**: Connect your Google Contacts account.
*   **Transcription Settings**:
    *   **Auto-Transcribe**: Enable/Disable auto-transcription for new uploads.
    *   **Provider**: Choose between **Soniox** (Standard, 1x Cost) and **ElevenLabs** (Premium, 6x Cost).
        *   *Note: ElevenLabs files longer than 5 minutes are processed asynchronously and may feel slower to appear.*
    *   **Model**: Select specific models if available (e.g., `scribe_v2`).
*   **Deletion Policy**: Set an automatic deletion policy (e.g., "Delete after 3 months") to manage storage.
*   **Export Data**:
    1.  Request a full backup of your recordings and transcripts.
    2.  Includes a **Premium Offline Viewer** (HTML) that works without internet.
    3.  You will receive an email with download links (valid for 7 days).
    4.  Extract all zip parts into a single folder and open `viewer.html` to browse your data offline.

### 🔔 Notifications
*   **Activity Digest**: Configure summary emails (Weekly/Monthly).
*   **Alerts**: Toggle notifications for successful or failed uploads.

### 💳 Billing
*   **Plan Overview**: View your current plan and trial status.
*   **Usage Stats**: Track your Storage and Transcription usage against your plan limits.
*   **Pay Per Usage**: Toggle overage billing on/off.
*   **Manage Subscription**: Link to the Stripe Customer Portal to upgrade, downgrade, or cancel.
