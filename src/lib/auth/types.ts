// Application auth types. No runtime imports — safe anywhere.

export interface AuthCapabilities {
    googleEnabled: boolean;
    emailVerificationRequired: boolean;
    passwordResetEnabled: boolean;
}

export type SignUpStatus = 'signed-in' | 'verification-required';

/** Authenticated identity resolved on the server. */
export interface SessionUser {
    /** Opaque stable subject; matches `User.authSubject` in MongoDB. */
    subject: string;
    email: string;
    name?: string | null;
    image?: string | null;
    emailVerified?: boolean;
}

/** Authenticated user shape exposed to client components. */
export interface AppUser {
    id: string;
    email: string;
    name?: string | null;
    image?: string | null;
    emailVerified: boolean;
    /** Whether the account can change its password (email-credential accounts). */
    canChangePassword: boolean;
}
