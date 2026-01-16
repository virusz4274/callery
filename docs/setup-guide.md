# Setup Guide

This guide will help you set up the VoSift application locally.

## Prerequisites

*   **Node.js**: v18 or later.
*   **MongoDB**: v6.0 or later (or MongoDB Atlas).
*   **Firebase Project**: With Authentication enabled.
*   **Cloudflare R2**: Bucket for file storage.
*   **Google Cloud Project**: For Google People API (Contact Sync).
*   **ElevenLabs Account**: For transcription.
*   **Google Gemini API Key**: For summarization.

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# MongoDB
MONGODB_URI=mongodb://localhost:27017/vosift

# Firebase (Client & Admin)
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your_project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."

# Authentication
SESSION_COOKIE_SECRET=complex_secret_string_min_32_chars

# Cloudflare R2
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=your_bucket_name

# AI Services
ELEVENLABS_API_KEY=your_elevenlabs_key
GOOGLE_GENERATIVE_AI_API_KEY=your_gemini_key

# Google Contacts Sync
GOOGLE_CLIENT_ID=your_oauth_client_id
GOOGLE_CLIENT_SECRET=your_oauth_client_secret

# Stripe Billing
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
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

## Running Locally

Start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:9002`.

## Scripts

*   `npm run dev`: Start dev server.
*   `npm run build`: Build for production.
*   `npm run start`: Start production server.
*   `npm run lint`: Run ESLint.
*   `npm run typecheck`: Run TypeScript compiler check.

