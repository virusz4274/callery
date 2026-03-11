'use client';

import React, { useMemo, useEffect, useRef, type ReactNode } from 'react';
import { FirebaseProvider } from './provider';
import { initializeFirebase } from './client';

interface FirebaseClientProviderProps {
    children: ReactNode;
}

const MAX_SYNC_ATTEMPTS = 3;
const SYNC_DEBOUNCE_MS = 1000;
const CIRCUIT_RETRY_AFTER_MS = 30_000;

export function FirebaseClientProvider({ children }: FirebaseClientProviderProps) {
    const firebaseServices = useMemo(() => {
        return initializeFirebase();
    }, []);

    const auth = firebaseServices.auth;

    // Circuit breaker state
    const syncAttempts = useRef(0);
    const lastSyncTime = useRef(0);
    const syncFailed = useRef(false);
    const circuitOpenedAt = useRef<number | null>(null);

    // Effect to subscribe to Firebase auth state changes and sync session
    useEffect(() => {
        if (!auth) return;

        // Use onIdTokenChanged to handle token refreshes as well
        const unsubscribe = auth.onIdTokenChanged(async (firebaseUser) => {
            const now = Date.now();

            // Debounce rapid token changes
            if (now - lastSyncTime.current < SYNC_DEBOUNCE_MS) {
                return;
            }

            // Circuit breaker - stop trying after max attempts
            if (syncFailed.current && syncAttempts.current >= MAX_SYNC_ATTEMPTS) {
                if (circuitOpenedAt.current === null) {
                    circuitOpenedAt.current = now;
                }

                const cooldownElapsed = now - circuitOpenedAt.current >= CIRCUIT_RETRY_AFTER_MS;
                if (!cooldownElapsed) {
                    const retryInMs = CIRCUIT_RETRY_AFTER_MS - (now - circuitOpenedAt.current);
                    console.warn(
                        `Session sync temporarily paused after ${MAX_SYNC_ATTEMPTS} failed attempts. Retrying in ${Math.ceil(retryInMs / 1000)}s.`
                    );
                    return;
                }

                // Cooldown elapsed - close the circuit and allow a retry.
                syncAttempts.current = 0;
                syncFailed.current = false;
                circuitOpenedAt.current = null;
            }

            lastSyncTime.current = now;

            if (firebaseUser) {
                // User is signed in or token refreshed
                try {
                    const idToken = await firebaseUser.getIdToken();
                    const response = await fetch('/api/auth/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ idToken }),
                    });

                    if (!response.ok) {
                        throw new Error(`Session sync failed: ${response.status}`);
                    }

                    // Success - reset circuit breaker
                    syncAttempts.current = 0;
                    syncFailed.current = false;
                    circuitOpenedAt.current = null;
                } catch (error) {
                    console.error('Failed to sync session:', error);
                    syncAttempts.current += 1;
                    syncFailed.current = true;

                    if (syncAttempts.current >= MAX_SYNC_ATTEMPTS) {
                        circuitOpenedAt.current = Date.now();
                        console.error(
                            `Max sync attempts (${MAX_SYNC_ATTEMPTS}) reached. Session sync paused for ${Math.floor(CIRCUIT_RETRY_AFTER_MS / 1000)}s.`
                        );
                    }
                }
            } else {
                // User is signed out - always try to clear session
                try {
                    await fetch('/api/auth/logout', { method: 'POST' });
                    // Reset circuit breaker on logout
                    syncAttempts.current = 0;
                    syncFailed.current = false;
                    circuitOpenedAt.current = null;
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
