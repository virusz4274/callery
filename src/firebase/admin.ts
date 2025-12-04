import { initializeApp, getApps, getApp, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// It is safe to leave the service account credentials empty for App Hosting.
// The Admin SDK will automatically discover the credentials from the environment.
const SERVICE_ACCOUNT = undefined;

let adminApp: App;

/**
 * Returns a singleton instance of the Firebase Admin App.
 * Initializes the app if it hasn't been initialized yet.
 */
export function getFirebaseAdminApp(): App {
    if (getApps().length > 0) {
        return getApp();
    }

    try {
        adminApp = initializeApp();
    } catch(e) {
        console.error("Failed to initialize Firebase Admin SDK", e);
        // This is a critical error, rethrow it.
        throw e;
    }
    
    return adminApp;
}

export function getAdminAuth() {
    return getAuth(getFirebaseAdminApp());
}

export function getAdminFirestore() {
    return getFirestore(getFirebaseAdminApp());
}
