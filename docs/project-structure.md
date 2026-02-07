# Project Structure

This document provides a high-level overview of the `vosift` codebase organization.

## Directory Layout

```
├── docs/               # Documentation
├── scripts/            # Utility scripts (testing, debugging)
│   ├── check-db.ts     # Verify MongoDB connection
│   ├── debug-contacts.ts # Debug contact sync
│   └── ...
├── src/
│   ├── app/            # Next.js App Router pages and API routes
│   │   ├── admin/      # Admin dashboard and collection management
│   │   ├── actions/    # Server Actions (Backend Logic)
│   │   ├── api/        # Backend API endpoints (Legacy/Hybrid)
│   │   ├── auth/       # Authentication pages
│   │   ├── dashboard/  # Main application dashboard
│   │   ├── files/      # File browser interface
│   │   └── upload/     # Manual upload interface
│   ├── components/     # Reusable React components
│   │   ├── dashboard/  # Dashboard-specific components
│   │   ├── pages/      # Page-specific components
│   │   └── ...
│   ├── hooks/          # Custom React hooks (e.g., use-auth)
│   ├── lib/            # Shared libraries and utilities
│   │   ├── db/         # Database connection and types
│   │   ├── firebase/   # Firebase Auth & Admin initialization
│   ├── services/       # Business logic and external service integrations
│   │   ├── ai/         # AI services (Gemini)
│   │   ├── google/     # Google API integrations (People/Contacts)
│   │   └── transcription/ # Transcription services (Soniox)
│   ├── lib/            # Shared libraries and utilities
│   │   ├── db/         # Database connection and types
│   │   ├── firebase/   # Firebase Auth & Admin initialization
│   │   └── r2.ts       # Cloudflare R2 utilities
│   ├── themes/         # Theme configurations
│   └── types/          # Global TypeScript definitions
├── public/             # Static assets
└── ...config files     # (next.config.ts, tailwind.config.ts, etc.)
```

## Key Files & Modules

### **Root Configuration**
*   `package.json`: Dependencies and scripts.
*   `next.config.ts`: Next.js configuration.
*   `tailwind.config.ts`: Visual design tokens and Tailwind setup.
*   `.env`: Environment variables (API keys, DB URIs).
*   `instrumentation.ts`: Next.js instrumentation hook (Sentry initialization).
*   `sentry.*.config.ts`: Sentry configuration for Server, Edge, and Client.

### **Core Logic (`src/app/actions`, `src/services` & `src/lib`)**
*   `src/app/actions`: Server Actions for business logic (Primary Backend).
    *   `upload-recordings.ts`: Handles server-side file upload to R2 and triggers AI processing.
    *   `search-actions.ts`: Semantic search using Vector Search (Gemini embeddings).
    *   `admin.ts` & `admin-*.ts`: Administrative functions.
*   `src/services/`: Encapsulated business logic and integrations.
    *   `ai/gemini-service.ts`: Google Gemini integration (Summarization, Embeddings).
    *   `transcription/soniox-service.ts`: Soniox transcription service.
    *   `google/`: Google Contacts sync logic.
*   `src/lib/db/`: Database logic.
    *   `init.ts`: Database initialization and seeding.
    *   `search.ts`: Vector Search implementation using MongoDB Atlas.
    *   `types.ts`: TypeScript interfaces for Data Models.
*   `src/lib/stripe/`: Billing logic (Sync, Usage Reporting).
*   `src/lib/sharing.ts`: JWT-based signed URL generation for secure sharing.
*   `src/lib/export-processor.ts`: Background task logic for archiving user data into ZIP files.
*   `src/lib/export-viewer-template.ts`: HTML/JS template for the premium offline data viewer.
*   `src/lib/api-client.ts`: Client-side authenticated fetch utility (`authFetch`).
*   `src/lib/auth-utils.ts`: Server-side session and request authentication helpers.
*   `src/lib/logger.ts`: Standardized logging utility with production suppression.
*   `src/lib/email.ts`: SMTP email delivery service.

### **Scripts (`scripts/` & `src/scripts/`)**
Utility scripts for maintenance and debugging. Run via `npx tsx <path-to-script>.ts`.
*   **System Tools (`scripts/`)**:
    *   `check-db.ts`: Verify MongoDB connection.
    *   `verify_plans_and_usage.ts`: Audit user plans and recalculate usage stats.
    *   `test-recording.ts`: Simulates a recording upload flow.
*   **Data Maintenance (`src/scripts/`)**:
    *   `backfill-contact-counts.ts`: Recalculates total recordings per contact.
    *   `fix-contact-stats.ts`: Repairs corrupted contact metadata.

### **API Routes (`src/app/api`)**
*   `/api/auth`: Handles session management.
*   `/api/recordings`: Fetch/Search recordings (Legacy/REST access).
*   `/api/contacts`: Contact management & sync.
*   `/api/filesystem`: File browser structure data.

### **UI Components (`src/components`)**
Organized by feature (e.g., `pages/admin`) or by type (`ui` for atomic components). Uses **HeroUI** for the design system.

#### **Key Components**:
*   `pages/file-browser-page.tsx`: Main interface for the improved File Browser.
*   `recording-view/recording-content.tsx`: Handles media playback, transcript display, and **Transliteration** toggles.
*   `settings/`: Reorganized settings tabs.
    *   `billing-settings.tsx`: Subscription management.
    *   `data-settings.tsx`: Export and Google Sync controls.
