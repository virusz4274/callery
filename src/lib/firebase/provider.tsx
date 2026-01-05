'use client';

import React, { createContext, useContext, ReactNode, useMemo, useState, useEffect } from 'react';
import { FirebaseApp } from 'firebase/app';
import { Auth, User, onAuthStateChanged } from 'firebase/auth';

interface FirebaseProviderProps {
    children: ReactNode;
    firebaseApp: FirebaseApp;
    auth: Auth;
}

interface UserAuthState {
    user: User | null;
    isUserLoading: boolean;
    userError: Error | null;
}

export interface FirebaseContextState {
    areServicesAvailable: boolean;
    firebaseApp: FirebaseApp | null;
    auth: Auth | null;
    user: User | null;
    isUserLoading: boolean;
    userError: Error | null;
}

export interface FirebaseServicesAndUser {
    firebaseApp: FirebaseApp;
    auth: Auth;
    user: User | null;
    isUserLoading: boolean;
    userError: Error | null;
}

export interface UserHookResult {
    user: User | null;
    isUserLoading: boolean;
    userError: Error | null;
}

export const FirebaseContext = createContext<FirebaseContextState | undefined>(undefined);

/**
 * FirebaseProvider manages and provides Firebase Auth state.
 */
export const FirebaseProvider: React.FC<FirebaseProviderProps> = ({
    children,
    firebaseApp,
    auth,
}) => {
    const [userAuthState, setUserAuthState] = useState<UserAuthState>({
        user: null,
        isUserLoading: true,
        userError: null,
    });

    // Effect to subscribe to Firebase auth state changes
    useEffect(() => {
        if (!auth) {
            setUserAuthState({ user: null, isUserLoading: false, userError: new Error("Auth service not provided.") });
            return;
        }

        const unsubscribe = onAuthStateChanged(
            auth,
            (firebaseUser) => {
                setUserAuthState({ user: firebaseUser, isUserLoading: false, userError: null });
            },
            (error) => {
                console.error("FirebaseProvider: onAuthStateChanged error:", error);
                setUserAuthState({ user: null, isUserLoading: false, userError: error });
            }
        );
        return () => unsubscribe();
    }, [auth]);

    const contextValue = useMemo((): FirebaseContextState => {
        const servicesAvailable = !!(firebaseApp && auth);
        return {
            areServicesAvailable: servicesAvailable,
            firebaseApp: servicesAvailable ? firebaseApp : null,
            auth: servicesAvailable ? auth : null,
            user: userAuthState.user,
            isUserLoading: userAuthState.isUserLoading,
            userError: userAuthState.userError,
        };
    }, [firebaseApp, auth, userAuthState]);

    return (
        <FirebaseContext.Provider value={contextValue}>
            {children}
        </FirebaseContext.Provider>
    );
};

export const useFirebase = (): FirebaseServicesAndUser => {
    const context = useContext(FirebaseContext);
    if (context === undefined) {
        throw new Error('useFirebase must be used within a FirebaseProvider.');
    }
    if (!context.areServicesAvailable || !context.firebaseApp || !context.auth) {
        throw new Error('Firebase core services not available.');
    }
    return {
        firebaseApp: context.firebaseApp,
        auth: context.auth,
        user: context.user,
        isUserLoading: context.isUserLoading,
        userError: context.userError,
    };
};

export const useAuth = (): Auth => {
    const { auth } = useFirebase();
    return auth;
};

export const useFirebaseApp = (): FirebaseApp => {
    const { firebaseApp } = useFirebase();
    return firebaseApp;
};

export const useUser = (): UserHookResult => {
    const { user, isUserLoading, userError } = useFirebase();
    return { user, isUserLoading, userError };
};
