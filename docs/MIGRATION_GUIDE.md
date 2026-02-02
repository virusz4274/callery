# User Manual: Cloudflare to Standard Node.js Migration

**Date**: 2026-02-02
**App**: Call Memo (Vosift)

## 1. Overview
This application has been successfully migrated from a Cloudflare Workers architecture back to a standard **Node.js** architecture. This enables you to deploy it easily to:
- **Vercel** (Recommended for zero-config)
- **Docker** (Self-hosted / VPS)
- **Any Node.js Server** (Railway, Flightcontrol, etc.)

## 2. Infrastructure Changes
- **Configuration**: `wrangler.json` (Cloudflare) is gone. We now use standard `.env` files.
- **Database**: MongoDB connection options are now optimized for standard/serverless pooling (no longer using Edge runtime limits).
- **Authentication**: reverted to the standard `firebase-admin` SDK. The custom `jose` JWT implementation has been removed.

## 3. How to Deploy

### Option A: Vercel (Cloud)
1.  Push your code to GitHub.
2.  Import the project into Vercel.
3.  Vercel will detect Next.js automatically.
4.  **Environment Variables**:
    - Copy all values from `.env` to Vercel Settings.
    - **Crucial**: Copy the *content* of `service-account.json` and paste it into a variable named `FIREBASE_SERVICE_ACCOUNT`.

### Option B: Docker (Self-Hosted)
A `Dockerfile` has been created that processes your secrets at build time.

**Build the Image:**
```bash
docker build -t call-memo .
```

**Run the Container:**
```bash
docker run -p 3000:3000 call-memo
```
*Note: Since you authorized baking secrets into the image, you do NOT need to mount files or pass env vars at runtime. The image is self-contained.*

> [!WARNING]
> Your `service-account.json` and `.env` are INSIDE this Docker image. Do not push this image to a public registry (like Docker Hub) or share the image file. It is for your private use only.

### Option C: Local Development
Standard Next.js workflow applies:
```bash
npm install
npm run dev
```
(Access at http://localhost:9000)

## 4. Key Files Reference
- `Dockerfile`: Production build instructions.
- `.dockerignore`: Controls what context is sent to Docker (Modified to allow secrets).
- `src/lib/firebase/admin.ts`: New universal auth loader (Checks file first, then env var).
- `src/lib/mongodb.ts`: Standard database connection logic.

## 5. Maintenance
- **Updating Secrets**: If you change `.env` or `service-account.json`, you must **rebuild** your Docker image (`docker build ...`) for the changes to take effect.
