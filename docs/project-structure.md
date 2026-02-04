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

### **Scripts (`scripts/`)**
Utility scripts for maintenance and debugging. Run via `npx tsx scripts/<name>.ts`.
*   `check-db.ts`: Verify MongoDB connection.
*   `verify_plans_and_usage.ts`: Audit user plans and recalculate usage stats.
*   `fix-speaker-ids.ts`: Repair corrupt speaker IDs in transcripts.
*   `check-user-stripe.ts`: Debug Stripe customer/subscription links.
*   `debug-contacts.ts`: Debug Google Contact sync.
*   `debug-transcripts.ts`: Inspect raw transcript data.

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
