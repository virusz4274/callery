'use client';

import React, { useMemo, useEffect, type ReactNode } from 'react';
import { FirebaseProvider } from './provider';
import { initializeFirebase } from './client';
// import { User } from 'firebase/auth'; // User type might be needed if I use it? No, checking usages.

interface FirebaseClientProviderProps {
    children: ReactNode;
}

export function FirebaseClientProvider({ children }: FirebaseClientProviderProps) {
    const firebaseServices = useMemo(() => {
        return initializeFirebase();
    }, []);

    const auth = firebaseServices.auth;

    // Effect to subscribe to Firebase auth state changes and sync session
    useEffect(() => {
        if (!auth) return;

        // Use onIdTokenChanged to handle token refreshes as well
        const unsubscribe = auth.onIdTokenChanged(async (firebaseUser) => {
            if (firebaseUser) {
                // User is signed in or token refreshed
                try {
                    const idToken = await firebaseUser.getIdToken();
                    await fetch('/api/auth/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ idToken }),
                    });
                } catch (error) {
                    console.error('Failed to sync session:', error);
                }
            } else {
                // User is signed out
                try {
                    await fetch('/api/auth/logout', { method: 'POST' });
                } catch (error) {
                    console.error('Failed to clear session:', error);
                }
            }
        });

        return () => unsubscribe();
    }, [auth]);

    return (
        <FirebaseProvider
            firebaseApp={firebaseServices.firebaseApp}
            auth={firebaseServices.auth}
        // Optionally, you might want to pass userAuthState down through context as well
        // user={userAuthState.user}
        // isUserLoading={userAuthState.isUserLoading}
        // userError={userAuthState.userError}
        >
            {children}
        </FirebaseProvider>
    );
}
