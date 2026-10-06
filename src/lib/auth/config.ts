import { emailProvider } from '@/lib/config';
import type { AuthCapabilities } from './types';

export function getGoogleCredentials(): { clientId: string; clientSecret: string } | null {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    if (!!clientId !== !!clientSecret) {
        throw new Error(`Missing ${clientId ? 'GOOGLE_CLIENT_SECRET' : 'NEXT_PUBLIC_GOOGLE_CLIENT_ID'}. Configure both Google OAuth credentials or leave both empty. See .env.example.`);
    }
    return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** Public configuration only; never initializes authentication or MongoDB. */
export function getAuthCapabilities(): AuthCapabilities {
    const emailsEnabled = emailProvider() !== 'none';
    return {
        googleEnabled: getGoogleCredentials() !== null,
        emailVerificationRequired: emailsEnabled,
        passwordResetEnabled: emailsEnabled,
    };
}

export function getAuthSecret(): string {
    const secret = process.env.BETTER_AUTH_SECRET;
    if (!secret || secret.length < 32) {
        throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters. See .env.example.');
    }
    return secret;
}
