'use client';

import { useState } from 'react';
import { Button, Card } from '@heroui/react';
import { authClient } from '@/lib/auth/auth-client';

export function OAuthSignInAgain({ loginUrl }: { loginUrl: string }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    async function signInAgain() {
        setBusy(true); setError('');
        try {
            const result = await authClient.signOut();
            if (result.error) throw new Error(result.error.message || 'Unable to start sign-in.');
            window.location.assign(loginUrl);
        } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to start sign-in.'); setBusy(false); }
    }
    return <div className="mx-auto w-full max-w-xl py-8 sm:py-12"><Card className="border border-border bg-surface shadow-none"><Card.Content className="space-y-5 p-5 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in to connect your account</h1>
        <p className="text-sm text-muted">This app requires a fresh Callery sign-in before you approve its permissions. Continue to sign out of this browser session and sign in again.</p>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <Button isPending={busy} isDisabled={busy} onPress={() => { void signInAgain(); }}>Sign in again</Button>
    </Card.Content></Card></div>;
}
