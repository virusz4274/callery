import { initializeApp, getApps, getApp, App, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { firebaseConfig } from './config';

/**
 * Returns a singleton instance of the Firebase Admin App.
 * Support for FIREBASE_SERVICE_ACCOUNT environment variable.
 */
export function getFirebaseAdminApp(): App {
    if (getApps().length > 0) {
        return getApp();
    }

    // Check for environment variable first
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccountJson) {
        try {
            const serviceAccount = JSON.parse(serviceAccountJson);
            return initializeApp({
                credential: cert(serviceAccount),
                projectId: firebaseConfig.projectId,
            });
        } catch (e) {
            console.warn("Failed to parse FIREBASE_SERVICE_ACCOUNT:", e);
        }
    }

    // Check for file in project root
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const fs = require('fs');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const path = require('path');
        const serviceAccountPath = path.join(process.cwd(), 'service-account.json');

        if (fs.existsSync(serviceAccountPath)) {
            const fileContent = fs.readFileSync(serviceAccountPath, 'utf8');
            const serviceAccount = JSON.parse(fileContent);
            return initializeApp({
                credential: cert(serviceAccount),
                projectId: firebaseConfig.projectId,
            });
        }
    } catch (e) {
        console.warn("Failed to load service-account.json:", e);
    }

    // Fallback to default (may use ADC in cloud)
    console.warn('Falling back to Application Default Credentials (ADC)');
    return initializeApp({
        projectId: firebaseConfig.projectId,
    });
}

export function getAdminAuth() {
    return getAuth(getFirebaseAdminApp());
}
