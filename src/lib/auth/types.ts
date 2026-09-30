// Shared auth types. Provider-agnostic: both `firebase` and `local`
// implementations map to these shapes. No runtime imports — safe anywhere.

/** Authenticated identity resolved on the server. */
export interface SessionUser {
    /** Opaque stable subject; matches `User.authSubject` in MongoDB. */
    subject: string;
    email: string;
    name?: string | null;
    image?: string | null;
    provider: 'firebase' | 'local';
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
