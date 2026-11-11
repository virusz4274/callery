'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Button, Chip, Input, Label, ListBox, Popover, Select, Spinner } from '@heroui/react';
import { Clock, Copy, Share2 } from 'lucide-react';
import { createShareLink, listRecordingShares, revokeShareLink } from '@/app/actions/sharing';
import { useTeamPolicy } from '@/hooks/use-team-policy';
import { useUser } from '@/lib/auth/client';
import type { ShareLinkResponse } from '@/lib/recording-share-types';

interface SharePopoverProps { recordingId: string }
const expirations = [
    { value: '1h', label: '1 hour' }, { value: '24h', label: '24 hours' },
    { value: '7d', label: '7 days' }, { value: 'custom', label: 'Choose date and time' },
];
const expiryMilliseconds: Record<string, number> = { '1h': 3600_000, '24h': 86400_000, '7d': 7 * 86400_000 };

export function ShareRecordingForm({ recordingId }: SharePopoverProps) {
    const team = useTeamPolicy();
    const { user } = useUser();
    const [expiration, setExpiration] = useState('24h');
    const [customDate, setCustomDate] = useState('');
    const [pending, setPending] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const { data: shares, error: loadError, isLoading, mutate } = useSWR<ShareLinkResponse[]>(
        user && !team ? ['recording-shares', user.id, recordingId] : null,
        () => listRecordingShares(recordingId), { refreshInterval: 60_000, revalidateOnFocus: true },
    );

    if (team) return <p className="text-sm text-muted">Public sharing is disabled for {team.companyName}. The company administrator can access the archive directly.</p>;

    async function create() {
        if (pending) return;
        setPending('create'); setError(''); setMessage('');
        try {
            const expiry = expiration === 'custom' ? new Date(customDate) : new Date(Date.now() + expiryMilliseconds[expiration]);
            if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now()) throw new Error('Choose an expiration date and time in the future.');
            const share = await createShareLink(recordingId, expiry.toISOString());
            await mutate(previous => [share, ...(previous || [])], { revalidate: false });
            setMessage('Share link created. Copy it below.');
        } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not create a share link. Try again.'); }
        finally { setPending(null); }
    }

    async function revoke(id: string) {
        if (pending) return;
        setPending(id); setError(''); setMessage('');
        try {
            await revokeShareLink(id);
            await mutate(previous => previous?.map(share => share.id === id
                ? { ...share, status: 'revoked', revokedAt: new Date().toISOString() } : share), { revalidate: false });
            setMessage('Share link revoked.');
        } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not revoke the link. Try again.'); }
        finally { setPending(null); }
    }

    async function copy(url: string) {
        setError('');
        try { await navigator.clipboard.writeText(url); setMessage('Link copied.'); }
        catch { setError('Clipboard unavailable. Select the link and copy it manually.'); }
    }

    return <div className="min-w-0 space-y-5">
        <div className="space-y-2">
            <h2 className="flex items-center gap-2 text-base font-semibold"><Share2 className="size-4" aria-hidden="true" />Share recording</h2>
            <p className="text-sm leading-6 text-muted">Share the full audio, transcript, and summary. Anyone with a link can open it until it expires or you revoke it.</p>
        </div>
        <form className="space-y-3" onSubmit={event => { event.preventDefault(); void create(); }}>
            <Select aria-label="Share link expiration" selectedKey={expiration} isDisabled={pending !== null}
                onSelectionChange={key => { if (key !== null) setExpiration(String(key)); }}>
                <Label>Expires in</Label>
                <Select.Trigger className="min-h-11"><Clock className="mr-2 size-4 text-muted" aria-hidden="true" /><Select.Value /><Select.Indicator /></Select.Trigger>
                <Select.Popover><ListBox>{expirations.map(item => <ListBox.Item key={item.value} id={item.value} textValue={item.label}>{item.label}</ListBox.Item>)}</ListBox></Select.Popover>
            </Select>
            {expiration === 'custom' && <div className="space-y-1.5">
                <Label htmlFor={`share-expiry-${recordingId}`}>Expiration date and time</Label>
                <Input id={`share-expiry-${recordingId}`} aria-label="Expiration date and time" type="datetime-local" required
                    className="min-h-11 w-full text-base" value={customDate} onChange={event => setCustomDate(event.target.value)} disabled={pending !== null} />
                <p className="text-xs text-muted">Uses your browser’s local time.</p>
            </div>}
            <Button type="submit" variant="primary" isPending={pending === 'create'} isDisabled={pending !== null} className="min-h-11 w-full">Generate link</Button>
        </form>
        {(error || loadError) && <p role="alert" className="text-sm text-danger">{error || 'Could not load share links. Try again.'}</p>}
        {message && <p role="status" aria-live="polite" className="text-sm text-muted">{message}</p>}
        <div className="space-y-3 border-t border-border pt-4">
            <h3 className="text-sm font-semibold">Your share links</h3>
            {isLoading && <div className="flex items-center gap-2 text-sm text-muted"><Spinner size="sm" />Loading share links…</div>}
            {!isLoading && !loadError && !shares?.length && <p className="text-sm text-muted">No share links yet.</p>}
            {loadError && <Button variant="secondary" size="sm" className="min-h-11" onPress={() => void mutate()}>Retry loading links</Button>}
            <ul className="max-h-80 space-y-3 overflow-y-auto overscroll-contain" aria-label="Recording share links">
                {shares?.map(share => {
                    const inactive = share.status === 'active' ? null : share.status;
                    return <li key={share.id} className="min-w-0 space-y-2 rounded-lg border border-border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted">Expires {new Date(share.expiresAt).toLocaleString()}</p>
                            <Chip size="sm" color={inactive ? 'default' : 'success'} variant="soft">{inactive === 'revoked' ? 'Revoked' : inactive === 'expired' ? 'Expired' : 'Active'}</Chip></div>
                        {!inactive && <>
                            <Input aria-label="Generated share link" readOnly value={share.url} variant="secondary" className="min-h-11 w-full text-sm" />
                            <div className="flex flex-wrap gap-2">
                                <Button size="sm" variant="secondary" className="min-h-11 flex-1" onPress={() => void copy(share.url)}><Copy className="size-4" />Copy link</Button>
                                <Button size="sm" variant="danger-soft" className="min-h-11" isPending={pending === share.id} isDisabled={pending !== null} onPress={() => void revoke(share.id)}>Revoke link</Button>
                            </div>
                        </>}
                    </li>;
                })}
            </ul>
        </div>
    </div>;
}

export function SharePopover({ recordingId }: SharePopoverProps) {
    const team = useTeamPolicy();
    const [isOpen, setIsOpen] = useState(false);
    if (team) return null;
    return <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
        <Popover.Trigger><Button variant="ghost" size="sm" className="min-h-11 gap-2 text-default-600" aria-label="Share recording"><Share2 className="size-4" /><span>Share</span></Button></Popover.Trigger>
        <Popover.Content className="w-[400px] max-w-[calc(100vw-1.5rem)] p-4" placement="bottom">
            <Popover.Dialog aria-label="Share recording">{isOpen && <ShareRecordingForm recordingId={recordingId} />}</Popover.Dialog>
        </Popover.Content>
    </Popover>;
}
