import { getApps, getApp, initializeApp, cert, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { existsSync } from 'fs';
import path from 'path';

/**
 * Get the fully initialized Firebase Admin app.
 * Ensures singleton pattern (reusing existing app if created).
 */
export function getFirebaseAdminApp(): App {
    if (getApps().length > 0) {
        return getApp();
    }

    // 1. Try to load from local file (Dev / Docker with mount)
    const localServiceAccountPath = path.join(process.cwd(), 'service-account.json');

    if (existsSync(localServiceAccountPath)) {
        try {
            return initializeApp({
                credential: cert(localServiceAccountPath),
            });
        } catch (error) {
            console.error('[Firebase Admin] Failed to load local service-account.json:', error);
            // Fallthrough to env var
        }
    }

    // 2. Fallback to Environment Variable (Production / Vercel)
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

    throw new Error('Missing Firebase Admin credentials. Please provide service-account.json or FIREBASE_SERVICE_ACCOUNT env var.');
}

/**
 * Get the Firebase Admin Auth service.
 */
export function getAdminAuth(): Auth {
    const app = getFirebaseAdminApp();
    return getAuth(app);
}
