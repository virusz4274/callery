'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Button, Card, Chip, Spinner } from '@heroui/react';
import { KeyRound, Copy, Plus } from 'lucide-react';
import { authFetch } from '@/lib/api-client';
import { INTEGRATION_SCOPES, SCOPE_LABELS } from '@/lib/integrations/shared';
import { useTeamPolicy } from '@/hooks/use-team-policy';
import { publicEnv } from '@/lib/public-env';

type Scope = typeof INTEGRATION_SCOPES[number];
interface Token { id: string; name: string; prefix: string; scopes: Scope[]; expiresAt: string | null; createdAt: string; revokedAt: string | null; lastUsedAt: string | null }
export function IntegrationSettings({ isAdmin }: { isAdmin: boolean }) {
    const team = useTeamPolicy();
    const { data: tokens = [], isLoading: loading, error: loadError, mutate: load } = useSWR<Token[]>('/api/user/api-tokens', async (url: string) => {
        const response = await authFetch(url); const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message || 'Unable to load tokens.');
        return body.data;
    });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [name, setName] = useState('');
    const [scopes, setScopes] = useState<Scope[]>(['recordings:upload', 'recordings:read']);
    const [expiry, setExpiry] = useState('90');
    const [date, setDate] = useState('');
    const [secret, setSecret] = useState<string | null>(null);
    const baseUrl = publicEnv.NEXT_PUBLIC_APP_URL;
    async function copy(value: string) {
        try { await navigator.clipboard.writeText(value); setMessage('Copied.'); }
        catch { setError('Clipboard unavailable. Select the text and copy it manually.'); }
    }
    async function operate(path: string, method: string, body?: unknown) {
        setBusy(true); setError(''); setMessage('');
        try {
            const response = await authFetch(`/api/user/api-tokens${path}`, { method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error?.message || 'Token operation failed.');
            if (result.data.secret) { setSecret(result.data.secret); setMessage('Save this token now. It is shown only once.'); }
            else setMessage('Token revoked.');
            await load();
            setName('');
        } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to save. Try again.'); }
        finally { setBusy(false); }
    }
    return <div className="space-y-4">
        <Card className="border border-border bg-surface shadow-none">
            <Card.Content className="space-y-4 p-5 sm:p-6">
                <div className="flex items-center gap-3"><KeyRound className="size-5" /><h3 className="text-lg font-semibold">Integrations</h3></div>
                <p className="text-sm text-muted">Connect a sync client or CRM with this server URL and a named API token. Uploads follow your account or company’s automatic transcription and retention settings.</p>
                <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">Server URL</span><code className="break-all text-sm">{baseUrl}</code><Button size="sm" variant="secondary" onPress={() => copy(baseUrl)}><Copy className="size-4" />Copy URL</Button></div>
                <a className="text-sm text-accent underline" href="/api/v1/openapi.json" target="_blank" rel="noreferrer">API reference (OpenAPI)</a>
                {secret && <div className="space-y-3 rounded-xl border border-warning bg-warning/10 p-4">
                    <p className="text-sm font-medium">Save your API token. It will not be displayed again.</p>
                    <code className="block break-all select-all text-sm">{secret}</code>
                    <div className="flex gap-2"><Button size="sm" onPress={() => copy(secret)}><Copy className="size-4" />Copy token</Button><Button size="sm" variant="secondary" onPress={() => setSecret(null)}>I’ve saved it</Button></div>
                </div>}
                {(error || loadError) && <p role="alert" className="text-sm text-danger">{error || loadError.message}</p>}
                <p role="status" aria-live="polite" className="text-sm text-muted">{message}</p>
                <form className="space-y-4" onSubmit={event => {
                    event.preventDefault();
                    if (!scopes.length) { setError('Select at least one permission.'); return; }
                    void operate('', 'POST', { name, scopes, ...(expiry === 'never' ? { expiresAt: null } : expiry === 'custom' ? { expiresAt: new Date(`${date}T23:59:59`).toISOString() } : {}) });
                }}>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1"><label htmlFor="token-name" className="text-sm font-medium">Token name</label><input id="token-name" className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-base" required maxLength={100} value={name} onChange={event => setName(event.target.value)} placeholder="My sync client or CRM" /></div>
                        <div className="space-y-1"><label htmlFor="token-expiry" className="text-sm font-medium">Expiration</label><select id="token-expiry" className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-base" value={expiry} onChange={event => setExpiry(event.target.value)}><option value="90">90 days</option><option value="custom">Choose date</option><option value="never">No expiration</option></select></div>
                    </div>
                    {expiry === 'custom' && <div className="space-y-1"><label htmlFor="token-date" className="text-sm font-medium">Expiration date</label><input id="token-date" type="date" required min={new Date().toISOString().slice(0, 10)} className="min-h-11 rounded-lg border border-border bg-background px-3 text-base" value={date} onChange={event => setDate(event.target.value)} /></div>}
                    <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">Permissions</legend>{INTEGRATION_SCOPES.filter(scope => !scope.startsWith('company:') || (isAdmin && team?.enabled)).map(scope => <label key={scope} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm"><input type="checkbox" checked={scopes.includes(scope)} onChange={event => setScopes(previous => event.target.checked ? [...previous, scope] : previous.filter(item => item !== scope))} className="size-4 accent-accent" />{SCOPE_LABELS[scope]}</label>)}</fieldset>
                    <p className="text-sm text-muted">Upload permission can trigger automatic transcription configured for your account. Request transcription allows the client to start it explicitly. Keep tokens in your client’s secure storage.</p>
                    <Button type="submit" isDisabled={busy || !!secret} className="w-full sm:w-auto">{busy ? <Spinner size="sm" color="current" /> : <Plus className="size-4" />}Create token</Button>
                </form>
            </Card.Content>
        </Card>
        <Card className="border border-border bg-surface shadow-none"><Card.Content className="space-y-4 p-5 sm:p-6">
            <h3 className="text-base font-semibold">Your API tokens</h3>
            {loading ? <Spinner aria-label="Loading tokens" /> : !tokens.length ? <p className="text-sm text-muted">Create a token for each client so you can revoke them separately.</p> : tokens.map(token => {
                const expired = !!token.expiresAt && new Date(token.expiresAt) <= new Date(); const inactive = !!token.revokedAt || expired;
                return <div key={token.id} className="space-y-3 rounded-xl border border-border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{token.name}</p><Chip size="sm" color={inactive ? 'default' : 'success'}>{token.revokedAt ? 'Revoked' : expired ? 'Expired' : 'Active'}</Chip></div>
                    <p className="break-words text-sm text-muted">{token.prefix}… · {token.expiresAt ? `Expires ${new Date(token.expiresAt).toLocaleDateString()}` : 'No expiration'} · {token.lastUsedAt ? `Last used ${new Date(token.lastUsedAt).toLocaleString()}` : 'Never used'}</p>
                    <p className="text-sm">{token.scopes.map(scope => SCOPE_LABELS[scope]).join(', ')}</p>
                    {!inactive && <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" isDisabled={busy || !!secret} onPress={() => { if (window.confirm(`Replace the credential for ${token.name}? Update the client with the new token.`)) void operate(`/${token.id}/rotate`, 'POST', {}); }}>Rotate token</Button><Button size="sm" variant="danger-soft" isDisabled={busy} onPress={() => { if (window.confirm(`Revoke ${token.name}? This client will lose API access.`)) void operate(`/${token.id}`, 'DELETE'); }}>Revoke token</Button></div>}
                </div>;
            })}
            {!loading && loadError && <Button size="sm" variant="secondary" onPress={() => { void load(); }}>Retry loading</Button>}
        </Card.Content></Card>
    </div>;
}
