'use client';

import React, { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInWithPopup,
    GoogleAuthProvider,
    signOut as firebaseSignOut,
    sendEmailVerification as firebaseSendVerification,
    sendPasswordResetEmail as firebaseSendReset,
    updatePassword as firebaseUpdatePassword,
    updateProfile as firebaseUpdateProfile,
    reauthenticateWithCredential,
    EmailAuthProvider,
    type User as FirebaseUser,
} from 'firebase/auth';
import { FirebaseClientProvider } from '@/lib/firebase/client-provider';
import { useFirebaseContext } from '@/lib/firebase/provider';
import { localAuthClient } from './local-client';
import type { AppUser } from './types';

/**
 * Client-side auth provider mirror. Must match server-side AUTH_PROVIDER.
 */
export function clientAuthProvider(): 'firebase' | 'local' {
    return process.env.NEXT_PUBLIC_AUTH_PROVIDER === 'local' ? 'local' : 'firebase';
}

export interface AuthActions {
    signInEmail(email: string, password: string): Promise<AppUser>;
    signUpEmail(name: string, email: string, password: string): Promise<AppUser>;
    signInGoogle(): Promise<AppUser | null>;
    signOut(): Promise<void>;
    sendVerificationEmail(): Promise<void>;
    changePassword(currentPassword: string, newPassword: string): Promise<void>;
    requestPasswordReset(email: string): Promise<void>;
    confirmPasswordReset(token: string, newPassword: string): Promise<void>;
    googleEnabled: boolean;
}

interface AuthState {
    user: AppUser | null;
    isUserLoading: boolean;
    userError: Error | null;
    actions: AuthActions;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

function useAuthContext(): AuthState {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useUser must be used within AuthProvider.');
    }
    return context;
}

function toAppUser(user: FirebaseUser): AppUser {
    return {
        id: user.uid,
        email: user.email ?? '',
        name: user.displayName,
        image: user.photoURL,
        emailVerified: user.emailVerified,
        canChangePassword: user.providerData.some((p) => p.providerId === 'password'),
    };
}

function FirebaseBranch({ children }: { children: ReactNode }) {
    const { user, isUserLoading, userError, auth } = useFirebaseContext();

    const actions = useMemo<AuthActions>(() => {
        const requireAuth = () => {
            if (!auth) throw new Error('Auth service not available.');
            return auth;
        };
        return {
            signInEmail: async (email, password) => {
                const credential = await signInWithEmailAndPassword(requireAuth(), email, password);
                return toAppUser(credential.user);
            },
            signUpEmail: async (name, email, password) => {
                const credential = await createUserWithEmailAndPassword(requireAuth(), email, password);
                if (name.trim()) {
                    await firebaseUpdateProfile(credential.user, { displayName: name.trim() });
                }
                return toAppUser(credential.user);
            },
            signInGoogle: async () => {
                const firebaseAuth = requireAuth();
                const provider = new GoogleAuthProvider();
                provider.setCustomParameters({ prompt: 'select_account' });
                if (firebaseAuth.currentUser) {
                    await firebaseSignOut(firebaseAuth);
                }
                const result = await signInWithPopup(firebaseAuth, provider);
                return toAppUser(result.user);
            },
            signOut: async () => {
                // Clear the server session cookie first, then Firebase state.
                await fetch('/api/auth/logout', { method: 'POST' });
                await firebaseSignOut(requireAuth());
            },
            sendVerificationEmail: async () => {
                const currentUser = requireAuth().currentUser;
                if (!currentUser) throw new Error('Not signed in.');
                await firebaseSendVerification(currentUser);
            },
            changePassword: async (currentPassword, newPassword) => {
                const currentUser = requireAuth().currentUser;
                if (!currentUser?.email) throw new Error('Not signed in.');
                const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
                await reauthenticateWithCredential(currentUser, credential);
                await firebaseUpdatePassword(currentUser, newPassword);
            },
            requestPasswordReset: async (email) => {
                await firebaseSendReset(requireAuth(), email);
            },
            confirmPasswordReset: async () => {
                // Firebase completes resets through the link in its own email
                // (Google-hosted handler); there is no app-side token to redeem.
                throw new Error('Use the reset link in your email to finish resetting your password.');
            },
            googleEnabled: true,
        };
    }, [auth]);

    const value = useMemo<AuthState>(
        () => ({ user: user ? toAppUser(user) : null, isUserLoading, userError, actions }),
        [user, isUserLoading, userError, actions],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function LocalBranch({ children }: { children: ReactNode }) {
    const { data, isPending, error } = localAuthClient.useSession();

    const actions = useMemo<AuthActions>(() => {
        const throwOnError = (error: { message?: string } | null, fallback: string) => {
            if (error) throw new Error(error.message || fallback);
        };
        const toLocalUser = (u: { id: string; email: string; name?: string | null; image?: string | null; emailVerified?: boolean | null }): AppUser => ({
            id: u.id,
            email: u.email,
            name: u.name ?? null,
            image: u.image ?? null,
            emailVerified: u.emailVerified ?? false,
            // Local email accounts can always change passwords; social-only
            // accounts get a clear server error if they try.
            canChangePassword: true,
        });
        return {
            signInEmail: async (email, password) => {
                const { data, error } = await localAuthClient.signIn.email({ email, password });
                throwOnError(error, 'Sign in failed.');
                if (!data?.user) throw new Error('Sign in failed.');
                return toLocalUser(data.user);
            },
            signUpEmail: async (name, email, password) => {
                const { data, error } = await localAuthClient.signUp.email({
                    name,
                    email,
                    password,
                    callbackURL: '/',
                });
                throwOnError(error, 'Sign up failed.');
                if (!data?.user) throw new Error('Sign up failed.');
                return toLocalUser(data.user);
            },
            signInGoogle: async () => {
                // Redirects to Google; resolves to null since navigation leaves the page.
                await localAuthClient.signIn.social({ provider: 'google', callbackURL: '/' });
                return null;
            },
            signOut: async () => {
                await localAuthClient.signOut();
                // Defensive: also clear a Firebase session cookie left from mode switches.
                await fetch('/api/auth/logout', { method: 'POST' });
            },
            sendVerificationEmail: async () => {
                const session = await localAuthClient.getSession();
                const email = session?.data?.user?.email;
                if (!email) throw new Error('Not signed in.');
                const { error } = await localAuthClient.sendVerificationEmail({ email, callbackURL: '/' });
                throwOnError(error, 'Failed to send verification email.');
            },
            changePassword: async (currentPassword, newPassword) => {
                const { error } = await localAuthClient.changePassword({
                    currentPassword,
                    newPassword,
                    revokeOtherSessions: true,
                });
                throwOnError(error, 'Password change failed.');
            },
            requestPasswordReset: async (email) => {
                const { error } = await localAuthClient.requestPasswordReset({
                    email,
                    redirectTo: '/reset-password',
                });
                throwOnError(error, 'Failed to send reset email.');
            },
            confirmPasswordReset: async (token, newPassword) => {
                const { error } = await localAuthClient.resetPassword({ newPassword, token });
                throwOnError(error, 'Password reset failed.');
            },
            googleEnabled: !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
        };
    }, []);

    const value = useMemo<AuthState>(() => {
        const sessionUser = data?.user ?? null;
        return {
            user: sessionUser
                ? {
                    id: sessionUser.id,
                    email: sessionUser.email,
                    name: sessionUser.name ?? null,
                    image: sessionUser.image ?? null,
                    emailVerified: sessionUser.emailVerified ?? false,
                    canChangePassword: true,
                }
                : null,
            isUserLoading: isPending,
            userError: error ? new Error(error.message || 'Session lookup failed.') : null,
            actions,
        };
    }, [data, isPending, error, actions]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Top-level auth provider. Renders the Firebase or local stack based on
 * NEXT_PUBLIC_AUTH_PROVIDER (must match server-side AUTH_PROVIDER).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
    if (clientAuthProvider() === 'local') {
        return <LocalBranch>{children}</LocalBranch>;
    }
    return (
        <FirebaseClientProvider>
            <FirebaseBranch>{children}</FirebaseBranch>
        </FirebaseClientProvider>
    );
}

/**
 * Hook to get current user authentication state (provider-agnostic).
 */
export function useUser(): Pick<AuthState, 'user' | 'isUserLoading' | 'userError'> {
    const { user, isUserLoading, userError } = useAuthContext();
    return { user, isUserLoading, userError };
}

/**
 * Hook to get sign-in/sign-up/sign-out actions (provider-agnostic).
 */
export function useAuthActions(): AuthActions {
    return useAuthContext().actions;
}
