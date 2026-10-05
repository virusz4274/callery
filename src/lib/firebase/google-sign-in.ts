export function isGoogleSignInCancelledError(error: unknown): boolean {
    const code = (error as { code?: string } | null)?.code;
    return code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request';
}
