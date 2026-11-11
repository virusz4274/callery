'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Button, Card, Chip, Spinner } from '@heroui/react';
import { Link2 } from 'lucide-react';
import { authFetch } from '@/lib/api-client';
import { oauthScopeLabel } from '@/lib/oauth-scope-labels';

interface Connection {
    id: string;
    name: string;
    scopes: string[];
    createdAt: string;
    lastUsedAt: string | null;
    revokedAt: string | null;
    resources: string[];
}

export function ConnectedApps() {
    const { data: connections = [], isLoading, error: loadError, mutate } = useSWR<Connection[]>('/api/integrations/connections', async (url: string) => {
        const response = await authFetch(url);
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message || 'Unable to load connected apps.');
        return body.data;
    });
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    async function disconnect(connection: Connection) {
        if (!window.confirm(`Disconnect ${connection.name}? This app will lose access to your Callery account.`)) return;
        setBusy(connection.id); setError(''); setMessage('');
        try {
            const response = await authFetch(`/api/integrations/connections/${encodeURIComponent(connection.id)}`, { method: 'DELETE' });
            const body = await response.json();
            if (!response.ok) throw new Error(body.error?.message || 'Unable to disconnect this app.');
            setMessage(`${connection.name} disconnected.`);
            await mutate();
        } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to disconnect this app.'); }
        finally { setBusy(null); }
    }
    return <Card className="border border-border bg-surface shadow-none"><Card.Content className="space-y-4 p-5 sm:p-6">
        <div className="flex items-center gap-3"><Link2 className="size-5" /><h3 className="text-lg font-semibold">Connected apps</h3></div>
        <p className="max-w-prose text-sm text-muted">Apps you connect through Callery sign-in appear here. Each app can access only the permissions you approved. Disconnect an app to revoke its access independently of your API tokens.</p>
        {(error || loadError) && <p role="alert" className="text-sm text-danger">{error || loadError.message}</p>}
        <p role="status" aria-live="polite" className="text-sm text-muted">{message}</p>
        {isLoading ? <Spinner aria-label="Loading connected apps" /> : !connections.length ? <p className="text-sm text-muted">No connected apps yet. Connect Callery from your AI app or integration to get started.</p> : connections.map(connection => <div key={connection.id} className="space-y-3 rounded-xl border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{connection.name}</p><Chip size="sm" color={connection.revokedAt ? 'default' : 'success'}>{connection.revokedAt ? 'Disconnected' : 'Connected'}</Chip></div>
            <p className="text-sm text-muted">Connected {new Date(connection.createdAt).toLocaleDateString()}. {connection.lastUsedAt ? `Last used ${new Date(connection.lastUsedAt).toLocaleString()}.` : 'Not used yet.'}</p>
            <ul className="list-disc space-y-1 pl-5 text-sm">{connection.scopes.map(scope => <li key={scope}>{oauthScopeLabel(scope)}</li>)}</ul>
            {!connection.revokedAt && <Button size="sm" variant="danger-soft" isDisabled={busy !== null} isPending={busy === connection.id} onPress={() => { void disconnect(connection); }}>Disconnect app</Button>}
        </div>)}
        {loadError && <Button size="sm" variant="secondary" onPress={() => { void mutate(); }}>Retry loading</Button>}
        <a className="text-sm text-accent underline" href="/developers">Connection and API documentation</a>
    </Card.Content></Card>;
}
