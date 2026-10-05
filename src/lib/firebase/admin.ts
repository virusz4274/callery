import { getApps, getApp, initializeApp, cert, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { existsSync } from 'fs';
import path from 'path';

/**
 * Get the fully initialized Firebase Admin app.
 * Ensures singleton pattern (reusing existing app if created).
 *
 * Reads FIREBASE_SERVICE_ACCOUNT first so edge runtimes without filesystem
 * access (Cloudflare Workers) never touch `fs`. The local service-account.json
 * file remains a Dev/Docker convenience and is guarded: runtimes where
 * process.cwd()/existsSync throw fall through to the actionable error below.
 */
export function getFirebaseAdminApp(): App {
    if (getApps().length > 0) {
        return getApp();
    }

    // 1. Environment Variable (Production / Vercel / Workers)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            return initializeApp({
                credential: cert(serviceAccount),
            });
        } catch (error) {
            console.error('[Firebase Admin] Failed to parse FIREBASE_SERVICE_ACCOUNT env var:', error);
            throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT environment variable');
        }
    }

    // 2. Local file (Dev / Docker with mount). Guarded for runtimes without fs.
    try {
        const localServiceAccountPath = path.join(process.cwd(), 'service-account.json');

        if (existsSync(localServiceAccountPath)) {
            try {
                return initializeApp({
                    credential: cert(localServiceAccountPath),
                });
            } catch (error) {
                console.error('[Firebase Admin] Failed to load local service-account.json:', error);
                // Fallthrough to the missing-credentials error below.
            }
        }
    } catch {
        // Filesystem unavailable (e.g. Cloudflare Workers) — fall through.
    }

    throw new Error('Missing Firebase Admin credentials. Provide service-account.json (Node dev/Docker) or the FIREBASE_SERVICE_ACCOUNT env var (required on Cloudflare Workers).');
}

/**
 * Get the Firebase Admin Auth service.
 */
export function getAdminAuth(): Auth {
    const app = getFirebaseAdminApp();
    return getAuth(app);
}
