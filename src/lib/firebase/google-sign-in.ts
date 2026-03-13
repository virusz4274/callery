'use client';

import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';
import {
    GoogleAuthProvider,
    signInWithCredential,
    signInWithPopup,
    signOut,
    type Auth,
    type User,
    type UserCredential,
} from 'firebase/auth';

const GOOGLE_SCOPES = ['email', 'profile'];

let initializePromise: Promise<void> | null = null;

function getGoogleWebClientId(): string {
    const webClientId = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
    if (!webClientId) {
        throw new Error('Missing NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID for Capacitor Google sign-in.');
    }

    return webClientId;
}

export function isNativeGoogleSignIn(): boolean {
    return Capacitor.isNativePlatform();
}

async function ensureGooglePluginInitialized(): Promise<void> {
    if (!isNativeGoogleSignIn()) {
        return;
    }

    if (!initializePromise) {
        initializePromise = SocialLogin.initialize({
            google: {
                webClientId: getGoogleWebClientId(),
                mode: 'online',
            },
        }).catch((error) => {
            initializePromise = null;
            throw error;
        });
    }

    await initializePromise;
}

export function isGoogleSignInCancelledError(error: unknown): boolean {
    const code =
        typeof error === 'object' && error !== null && 'code' in error
            ? String((error as { code?: unknown }).code ?? '')
            : '';
    const message =
        typeof error === 'object' && error !== null && 'message' in error
            ? String((error as { message?: unknown }).message ?? '').toLowerCase()
            : '';

    return (
        code === 'auth/popup-closed-by-user' ||
        message.includes('popup closed') ||
        message.includes('cancelled') ||
        message.includes('canceled')
    );
}

export async function signInWithGoogle(auth: Auth): Promise<UserCredential> {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
        prompt: 'select_account',
    });

    if (auth.currentUser) {
        await signOut(auth);
    }

    if (!isNativeGoogleSignIn()) {
        return signInWithPopup(auth, provider);
    }

    await ensureGooglePluginInitialized();

    const response = await SocialLogin.login({
        provider: 'google',
        options: {
            scopes: GOOGLE_SCOPES,
        },
    });

    if (response.result.responseType !== 'online' || !response.result.idToken) {
        throw new Error('Google sign-in did not return an ID token.');
    }

    const credential = GoogleAuthProvider.credential(
        response.result.idToken,
        response.result.accessToken?.token
    );

    return signInWithCredential(auth, credential);
}

export async function signOutNativeGoogle(user: User | null): Promise<void> {
    if (!isNativeGoogleSignIn()) {
        return;
    }

    const isGoogleUser = user?.providerData.some((provider) => provider.providerId === 'google.com') ?? false;
    if (!isGoogleUser) {
        return;
    }

    try {
        await ensureGooglePluginInitialized();
        await SocialLogin.logout({ provider: 'google' });
    } catch (error) {
        console.warn('Failed to clear native Google session:', error);
    }
}
