'use client';

import { useState } from 'react';
import { Button, Card } from '@heroui/react';
import { Link2 } from 'lucide-react';
import { oauthScopeLabel } from '@/lib/oauth-scope-labels';

interface Props {
    query: string;
    clientName: string;
    clientUri?: string;
    account: string;
    scopes: string[];
    claims: string[];
}

export function OAuthConsentForm({ query, clientName, clientUri, account, scopes, claims }: Props) {
    const [busy, setBusy] = useState<'allow' | 'deny' | null>(null);
    const [error, setError] = useState('');
    async function decide(accept: boolean) {
        setBusy(accept ? 'allow' : 'deny'); setError('');
        try {
            const response = await fetch('/api/auth/oauth2/consent', {
                method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ accept, oauth_query: query }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error_description || result.message || 'This connection request could not be completed. Start again from the app.');
            if (!result.redirect || typeof result.url !== 'string') throw new Error('The app did not provide a return address. Start the connection again.');
            window.location.assign(result.url);
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'Unable to complete this connection. Start again from the app.');
            setBusy(null);
        }
    }
    return <div className="mx-auto w-full max-w-xl py-8 sm:py-12"><Card className="border border-border bg-surface shadow-none"><Card.Content className="space-y-6 p-5 sm:p-8">
        <div className="space-y-3"><Link2 aria-hidden="true" className="size-7 text-accent" /><h1 className="text-2xl font-semibold tracking-tight">Connect {clientName} to Callery</h1><p className="break-words text-sm text-muted">Signed in as {account}</p>{clientUri && <p className="break-all text-sm text-muted">App website: {clientUri}</p>}</div>
        <div className="space-y-3"><h2 className="font-medium">This app is requesting permission to:</h2><ul className="list-disc space-y-3 pl-5 text-sm">{scopes.map(scope => <li key={scope}>{oauthScopeLabel(scope)}</li>)}</ul>{claims.length > 0 && <p className="break-words text-sm text-muted">Requested account details: {claims.join(', ')}.</p>}</div>
        {(scopes.includes('recordings:upload') || scopes.includes('recordings:transcribe')) && <p className="rounded-lg border border-border bg-background p-3 text-sm">Uploads follow your automatic transcription settings. Uploading or requesting transcription may use your account’s processing allowance.</p>}
        <p className="text-sm text-muted">The app can receive the content covered by these permissions. Its own privacy policy applies to data it receives. You can disconnect it at any time in Settings → Integrations. Signing out of Callery or ending this session may require reconnecting the app.</p>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end"><Button variant="secondary" isDisabled={busy !== null} isPending={busy === 'deny'} onPress={() => { void decide(false); }}>Cancel</Button><Button isDisabled={busy !== null} isPending={busy === 'allow'} onPress={() => { void decide(true); }}>Allow access</Button></div>
    </Card.Content></Card></div>;
}
