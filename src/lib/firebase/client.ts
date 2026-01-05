'use client';

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { firebaseConfig } from './config';

/**
 * Initialize Firebase for client-side use (Auth only).
 */
export function initializeFirebase() {
    const firebaseApp = getApps().length === 0
        ? initializeApp(firebaseConfig)
        : getApp();

    return {
        firebaseApp,
        auth: getAuth(firebaseApp),
    };
}
