'use client';

import React, { createContext, useContext, ReactNode, useMemo, useState, useEffect } from 'react';
import { FirebaseApp } from 'firebase/app';
import { Auth, User, onAuthStateChanged } from 'firebase/auth';

// ============================================================================
// Types - Simplified to 2 core interfaces
// ============================================================================

interface FirebaseProviderProps {
    children: ReactNode;
    firebaseApp: FirebaseApp;
    auth: Auth;
}

/**
 * Core Firebase context state - used internally and exposed via hooks.
 */
export interface FirebaseState {
    firebaseApp: FirebaseApp | null;
    auth: Auth | null;
    user: User | null;
    isUserLoading: boolean;
    userError: Error | null;
}

// ============================================================================
// Context
// ============================================================================

const FirebaseContext = createContext<FirebaseState | undefined>(undefined);

// ============================================================================
// Provider
// ============================================================================

/**
 * FirebaseProvider manages and provides Firebase Auth state.
 */
export const FirebaseProvider: React.FC<FirebaseProviderProps> = ({
    children,
    firebaseApp,
    auth,
}) => {
    const [user, setUser] = useState<User | null>(null);
    const [isUserLoading, setIsUserLoading] = useState(Boolean(auth));
    const [userError, setUserError] = useState<Error | null>(
        auth ? null : new Error("Auth service not provided.")
    );

    useEffect(() => {
        if (!auth) {
            return;
        }

        const unsubscribe = onAuthStateChanged(
            auth,
            (firebaseUser) => {
                setUser(firebaseUser);
                setIsUserLoading(false);
                setUserError(null);
            },
            (error) => {
                console.error("FirebaseProvider: onAuthStateChanged error:", error);
                setUser(null);
                setIsUserLoading(false);
                setUserError(error);
            }
        );
        return () => unsubscribe();
    }, [auth]);

    const contextValue = useMemo((): FirebaseState => ({
        firebaseApp,
        auth,
        user,
        isUserLoading,
        userError,
    }), [firebaseApp, auth, user, isUserLoading, userError]);

    return (
        <FirebaseContext.Provider value={contextValue}>
            {children}
        </FirebaseContext.Provider>
    );
};

// ============================================================================
// Hooks
// ============================================================================

/**
 * Low-level hook to access full Firebase context.
 * @throws Error if used outside FirebaseProvider
 */
export function useFirebaseContext(): FirebaseState {
    const context = useContext(FirebaseContext);
    if (context === undefined) {
        throw new Error('useFirebaseContext must be used within a FirebaseProvider.');
    }
    return context;
}

/**
 * Hook to get Firebase services. Throws if services aren't available.
 */
export function useFirebase(): { firebaseApp: FirebaseApp; auth: Auth } {
    const { firebaseApp, auth } = useFirebaseContext();
    if (!firebaseApp || !auth) {
        throw new Error('Firebase services not available.');
    }
    return { firebaseApp, auth };
}

/**
 * Hook to get Auth instance.
 */
export function useAuth(): Auth {
    const { auth } = useFirebase();
    return auth;
}

/**
 * Hook to get FirebaseApp instance.
 */
export function useFirebaseApp(): FirebaseApp {
    const { firebaseApp } = useFirebase();
    return firebaseApp;
}

/**
 * Hook to get current user authentication state.
 */
export function useUser(): Pick<FirebaseState, 'user' | 'isUserLoading' | 'userError'> {
    const { user, isUserLoading, userError } = useFirebaseContext();
    return { user, isUserLoading, userError };
}
