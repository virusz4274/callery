'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import useSWR from 'swr';
import { authClient } from './auth-client';
import { buildAuthPageHref, resolvePostAuthRedirect } from '@/lib/auth-redirect';
import type { AppUser, AuthCapabilities, SignUpStatus } from './types';

export interface AuthActions extends AuthCapabilities {
    signInEmail(email: string, password: string): Promise<AppUser>;
    signUpEmail(name: string, email: string, password: string, redirect?: string): Promise<SignUpStatus>;
    signInGoogle(redirect?: string): Promise<void>;
    signOut(): Promise<void>;
    sendVerificationEmail(email?: string, redirect?: string): Promise<void>;
    changePassword(currentPassword: string, newPassword: string): Promise<void>;
    requestPasswordReset(email: string, redirect?: string): Promise<void>;
    confirmPasswordReset(token: string, newPassword: string): Promise<void>;
}

interface AuthState {
    user: AppUser | null;
    isUserLoading: boolean;
    userError: Error | null;
    actions: AuthActions;
}

const AuthContext = createContext<AuthState | undefined>(undefined);
const emptyCapabilities: AuthCapabilities = { googleEnabled: false, emailVerificationRequired: false, passwordResetEnabled: false };

function throwOnError(error: { message?: string } | null, fallback: string) {
    if (error) throw new Error(error.message || fallback);
}

function toAppUser(user: { id: string; email: string; name?: string | null; image?: string | null; emailVerified?: boolean }, canChangePassword: boolean): AppUser {
    return { id: user.id, email: user.email, name: user.name ?? null, image: user.image ?? null, emailVerified: user.emailVerified ?? false, canChangePassword };
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const { data, isPending, error } = authClient.useSession();
    const { data: configuration, error: configurationError, isLoading: configurationLoading } = useSWR<AuthCapabilities>('/api/auth/capabilities', async (url: string) => {
        const response = await fetch(url, { cache: 'no-store' });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Authentication configuration unavailable.');
        return body;
    });
    const userId = data?.user.id;
    const { data: accounts } = useSWR(userId ? ['auth-accounts', userId] : null, async () => {
        const result = await authClient.listAccounts();
        throwOnError(result.error, 'Could not load login methods.');
        return result.data;
    });
    const capabilities = configuration ?? emptyCapabilities;
    const canChangePassword = accounts?.some(account => account.providerId === 'credential') ?? false;

    const actions = useMemo<AuthActions>(() => ({
        ...capabilities,
        signInEmail: async (email, password) => {
            const result = await authClient.signIn.email({ email, password });
            throwOnError(result.error, 'Sign in failed.');
            if (!result.data?.user) throw new Error('Sign in failed.');
            return toAppUser(result.data.user, true);
        },
        signUpEmail: async (name, email, password, redirect) => {
            const result = await authClient.signUp.email({ name, email, password, callbackURL: buildAuthPageHref('/login', resolvePostAuthRedirect(redirect)) });
            throwOnError(result.error, 'Sign up failed.');
            if (!result.data) throw new Error('Sign up failed.');
            return result.data.token ? 'signed-in' : 'verification-required';
        },
        signInGoogle: async redirect => {
            const result = await authClient.signIn.social({ provider: 'google', callbackURL: resolvePostAuthRedirect(redirect), errorCallbackURL: buildAuthPageHref('/login', resolvePostAuthRedirect(redirect)) });
            throwOnError(result.error, 'Google sign in failed.');
        },
        signOut: async () => {
            const result = await authClient.signOut();
            throwOnError(result.error, 'Sign out failed.');
        },
        sendVerificationEmail: async (address, redirect) => {
            if (!capabilities.emailVerificationRequired) throw new Error('Email verification is unavailable on this instance.');
            const email = address || (await authClient.getSession()).data?.user.email;
            if (!email) throw new Error('An email address is required.');
            const result = await authClient.sendVerificationEmail({ email, callbackURL: buildAuthPageHref('/login', resolvePostAuthRedirect(redirect)) });
            throwOnError(result.error, 'Failed to send verification email.');
        },
        changePassword: async (currentPassword, newPassword) => {
            const result = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
            throwOnError(result.error, 'Password change failed.');
        },
        requestPasswordReset: async (email, redirect) => {
            if (!capabilities.passwordResetEnabled) throw new Error('Password recovery is unavailable on this instance. Contact its administrator.');
            const result = await authClient.requestPasswordReset({ email, redirectTo: buildAuthPageHref('/reset-password', resolvePostAuthRedirect(redirect)) });
            throwOnError(result.error, 'Failed to send reset email.');
        },
        confirmPasswordReset: async (token, newPassword) => {
            const result = await authClient.resetPassword({ newPassword, token });
            throwOnError(result.error, 'Password reset failed.');
        },
    }), [capabilities]);

    const value = useMemo<AuthState>(() => ({
        user: data?.user ? toAppUser(data.user, canChangePassword) : null,
        isUserLoading: isPending || configurationLoading,
        userError: configurationError || (error ? new Error(error.message || 'Session lookup failed.') : null),
        actions,
    }), [data, canChangePassword, isPending, configurationLoading, configurationError, error, actions]);
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function useAuthContext(): AuthState {
    const context = useContext(AuthContext);
    if (!context) throw new Error('Authentication hooks must be used within AuthProvider.');
    return context;
}

export function useUser(): Pick<AuthState, 'user' | 'isUserLoading' | 'userError'> {
    const { user, isUserLoading, userError } = useAuthContext();
    return { user, isUserLoading, userError };
}

export function useAuthActions(): AuthActions {
    return useAuthContext().actions;
}
