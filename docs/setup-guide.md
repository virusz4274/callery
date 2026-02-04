# Setup Guide

This guide will help you set up the VoSift application locally.

## Prerequisites

*   **Node.js**: v18 or later (v20 recommended, matches Dockerfile).
*   **MongoDB**: v6.0 or later (or MongoDB Atlas).
*   **Firebase Project**: With Authentication enabled.
*   **Cloudflare R2**: Bucket for file storage.
*   **Google Cloud Project**: For Google People API (Contact Sync).
*   **SMTP Server**: For sending export emails (e.g., SendGrid, Mailgun, or Gmail).
*   **Soniox Account**: For transcription.
*   **Google Gemini API Key**: For summarization.

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# MongoDB
MONGODB_URI=mongodb://localhost:27017/vosift

# Firebase (Client)
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
# Firebase (Admin)
# Option A: file-based (recommended for local/dev)
# Place service-account.json in the project root.
# Option B: env-based (recommended for Vercel)
FIREBASE_SERVICE_ACCOUNT={"type":"service_account", ...}

# Cloudflare R2
R2_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=your_bucket_name

# AI Services
SONIOX_API_KEY=your_soniox_key
SONIOX_API_BASE_URL=https://api.soniox.com
SONIOX_MODEL_ID=stt-async-v3
GOOGLE_GENERATIVE_AI_API_KEY=your_gemini_key

# Google Contacts Sync (OAuth)
# Either NEXT_PUBLIC_GOOGLE_CLIENT_ID or GOOGLE_CLIENT_ID is required.
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_oauth_client_id
GOOGLE_CLIENT_SECRET=your_oauth_client_secret
NEXT_PUBLIC_GOOGLE_REDIRECT_URI=http://localhost:9000/api/auth/google/callback

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:9000

# Stripe Billing
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_ENABLE_BILLING=true

# Optional UI flags
NEXT_PUBLIC_SHOW_MOBILE_BURGER_MENU=false
# Optional UI flags
NEXT_PUBLIC_SHOW_MOBILE_BURGER_MENU=false

# Monitoring (Sentry)
# Sentry DSN is optional (hardcoded fallback exists, but env var is preferred)
SENTRY_DSN=https://...
NEXT_PUBLIC_SENTRY_DSN=https://...
SENTRY_AUTH_TOKEN=...

# Email (SMTP) for Exports
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user
SMTP_PASS=password
SMTP_FROM="Call Organizer <no-reply@example.com>"
```

## Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/your-repo/vosift.git
    cd vosift
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  **Initialize the Database**:
    This creates necessary indexes and seeds default plans.
    ```bash
    npx tsx src/lib/db/init.ts
    ```

## 4. Search Indexes (MongoDB Atlas)

For Search features to work, you must create **Search Indexes** in the MongoDB Atlas UI.

### 1. Vector Search Index (Semantic Search)
*   **Index Name**: `recordings_vector_search`
*   **Collection**: `recordings`
*   **Type**: Vector Search
*   **Configuration (JSON)**:
    ```json
    {
      "fields": [
        {
          "numDimensions": 3072,
          "path": "summaryEmbedding",
          "similarity": "cosine",
          "type": "vector"
        },
        {
          "path": "firebaseUid",
          "type": "filter"
        }
      ]
    }
    ```

### 2. Full-Text Search Index (Optional)
*   **Index Name**: `recordings_text_search`
*   **Collection**: `recordings`
*   **Type**: Search
*   **Mappings**: (See `src/lib/db/init.ts` output for config)

## Running Locally

Start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:9000`.

## Scripts

*   `npm run dev`: Start dev server.
*   `npm run build`: Build for production.
*   `npm run start`: Start production server.
*   `npm run lint`: Run ESLint.
*   `npm run typecheck`: Run TypeScript compiler check.

## Quality Checks
To ensure code quality before pushing changes:

```bash
npm run typecheck
npm run lint
```

## Running with Docker

You can also run the application using Docker and Docker Compose. This is useful for ensuring a consistent environment.

1.  **Prerequisites**:
    *   Docker and Docker Compose installed on your machine.
    *   `.env` file created (see [Environment Variables](#environment-variables)).

2.  **Build and Run**:
    ```bash
    docker-compose up -d --build
    ```

3.  **Access the App**:
    The application will be running at [http://localhost:9000](http://localhost:9000).

4.  **Stop the App**:
    ```bash
    docker-compose down
    ```

5.  **View Logs**:
    ```bash
    docker-compose logs -f
    ```
