# Project Structure

This document provides a high-level overview of the `call-memo` codebase organization.

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
│   │   ├── elevenlabs.ts # Transcription service
│   │   ├── llm.ts      # AI summarization service
│   │   └── r2.ts       # Cloudflare R2 utilities
│   ├── themes/         # Theme configurations
│   └── types/          # Global TypeScript definitions
├── public/             # Static assets
└── ...config files     # (next.config.ts, tailwind.config.ts, etc.)
```

## Key Files & Modules

### **Configuration**
*   `package.json`: Dependencies and scripts.
*   `next.config.ts`: Next.js configuration.
*   `tailwind.config.ts`: Visual design tokens and Tailwind setup.
*   `.env`: Environment variables (API keys, DB URIs).

### **Core Logic (`src/app/actions` & `src/lib`)**
*   `src/app/actions`: Server Actions for business logic (e.g., `upload-recordings.ts`, `admin.ts`).
*   `src/lib/db/init.ts`: MongoDB connection handler.
*   `src/lib/firebase/`: Firebase client/admin setup.
*   `src/lib/r2.ts`: Cloudflare R2 storage utilities.

### **API Routes (`src/app/api`)**
*   `/api/auth`: Handles session management.
*   `/api/recordings`: Fetch/Search recordings (Legacy/REST access).
*   `/api/contacts`: Contact management & sync.
*   `/api/filesystem`: File browser structure data.

### **UI Components (`src/components`)**
Organized by feature (e.g., `pages/admin`) or by type (`ui` for atomic components). Uses **HeroUI** for the design system.
