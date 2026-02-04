# Project Context: CallOrganizer (VoSift)

## Overview
CallOrganizer is a modern web application designed for managing, transcribing, and organizing phone call recordings. It leverages advanced AI for transcription (Soniox) and summarization/analysis (Google Gemini). The application is built on a robust tech stack featuring Next.js 16, MongoDB, and Cloudflare R2.

## Key Technologies
*   **Framework**: Next.js 16 (App Router), React 19
*   **Styling**: Tailwind CSS v4, HeroUI
*   **Database**: MongoDB (using `mongodb` native driver) with Vector Search capabilities
*   **Storage**: Cloudflare R2 (S3-compatible object storage)
*   **Authentication**: Firebase Auth (Google Sign-In, Anonymous)
*   **AI Services**:
    *   **Google Gemini**: Summarization, Vector Embeddings, Semantic Search
    *   **Soniox**: Speech-to-Text (Transcription) and Diarization
*   **Billing**: Stripe (Metered billing for storage/transcription + Subscriptions)
*   **External Integrations**: Google People API (Contact Sync)

## Architecture
The project follows a **Service-Oriented Architecture** within the Next.js App Router:
*   **`src/app/actions/`**: Server Actions handle business logic and data mutations (primary backend entry points).
*   **`src/app/api/`**: Traditional API routes (less used, mostly for webhooks or specific endpoints).
*   **`src/services/`**: Encapsulated logic for external services (e.g., `SonioxService`, `GeminiService`).
*   **`src/lib/db/`**: Database interactions and TypeScript interfaces (`types.ts` is the source of truth for models).
*   **`src/components/`**: UI components, following Atomic Design principles (atoms in `ui-primitives.tsx`).

## Development Workflow

### Prerequisites
*   Node.js v20+
*   MongoDB v6.0+
*   Cloudflare R2 Bucket
*   Firebase Project

### Key Commands
*   **Start Development Server**: `npm run dev` (Runs on port **9000**)
*   **Build for Production**: `npm run build`
*   **Start Production Server**: `npm run start`
*   **Type Checking**: `npm run typecheck`
*   **Linting**: `npm run lint`
*   **Initialize Database**: `npx tsx src/lib/db/init.ts` (Creates indexes and seeds plans)

### Useful Scripts (`scripts/`)
*   `check-db.ts`: Verify DB connection.
*   `verify_plans_and_usage.ts`: Audit billing/usage stats.
*   `test-recording.ts`: Simulate upload flow.

## Project Structure
*   `docs/`: Extensive documentation (Architecture, API, Billing, Setup). **Consult `docs/README.md` first.**
*   `src/lib/db/types.ts`: **CRITICAL**. Defines the MongoDB schema for Users, Recordings, Contacts, and Plans.
*   `src/lib/stripe/`: Complex logic for metered billing and subscription syncing.
