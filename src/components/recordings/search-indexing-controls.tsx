'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@heroui/react';
import { getSearchIndexingStatusAction, startSearchIndexingAction } from '@/app/actions/search-indexing';
import { useUser } from '@/lib/auth/client';
import type { SearchIndexingScope } from '@/lib/search/types';

export function SearchIndexingControls({ scope, onUpdated }: { scope: SearchIndexingScope; onUpdated: () => void }) {
    const { user } = useUser();
    const [confirmingOwner, setConfirmingOwner] = useState<string>();
    const [request, setRequest] = useState<{ owner: string; pending: boolean; error?: string; message?: string }>();
    const generation = useRef(0);
    const inFlight = useRef(false);
    const { contactId, startDate, endDate } = scope;
    useEffect(() => () => { generation.current++; inFlight.current = false; }, [user?.id, contactId, startDate, endDate]);
    const { data, error, mutate, isLoading } = useSWR(user ? ['search-indexing', user.id, contactId, startDate, endDate] : null, async () => {
        const result = await getSearchIndexingStatusAction({ contactId, startDate, endDate }, user?.id);
        if (!result.success) throw new Error(result.error);
        return result.status;
    }, { shouldRetryOnError: false, refreshInterval: status => status && (status.queued || status.running) ? 5000 : 0,
        onSuccess: status => { if (!status.queued && !status.running) onUpdated(); } });
    const active = request?.owner === user?.id ? request : undefined;
    const confirming = Boolean(user && confirmingOwner === `${user.id}:${contactId || ''}:${startDate || ''}:${endDate || ''}`);
    const available = data?.available ?? data?.eligible ?? 0;
    const begin = async () => {
        if (!user || inFlight.current) return;
        inFlight.current = true;
        const version = ++generation.current;
        const owner = user.id;
        setRequest({ owner, pending: true });
        try {
            const result = await startSearchIndexingAction({ contactId, startDate, endDate }, owner);
            if (version !== generation.current) return;
            if (!result.success) setRequest({ owner, pending: false, error: result.error });
            else {
                setRequest({ owner, pending: false, message: `${result.queued} recordings queued for indexing.${result.needsReview ? ` ${result.needsReview} need administrator review before retrying.` : ''}` });
                setConfirmingOwner(undefined);
            }
            await mutate(); onUpdated();
        } catch {
            if (version === generation.current) setRequest({ owner, pending: false, error: 'Could not confirm indexing. Refresh the queue status before retrying.' });
        } finally { if (version === generation.current) inFlight.current = false; }
    };
    if (!user) return null;
    return <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
        <p className="font-medium">Index saved transcripts</p>
        <p className="text-muted">Make existing recordings searchable by meaning without transcribing audio again. Your contact and date filters apply.</p>
        {isLoading && <p role="status">Checking indexing status…</p>}
        {data && <>
            <p role="status">{data.eligible} recordings need indexing in this view. Your workspace queue: {data.queued} waiting, {data.running} running.</p>
            {data.needsReview > 0 && <p role="status" className="text-warning">{data.needsReview} indexing jobs need administrator review. Uncertain provider requests are not repeated automatically.</p>}
            {!data.ready && <p role="status" className="text-muted">{data.message}</p>}
            {confirming ? <div className="space-y-2">
                <p>Index up to {Math.min(available, data.batchSize)} saved transcripts using the configured embedding provider? Provider charges may apply. Original audio, transcripts and summaries stay unchanged.</p>
                <div className="flex flex-wrap gap-2"><Button className="min-h-11" isPending={active?.pending} isDisabled={active?.pending || !data.ready} onPress={begin}>Start indexing</Button>
                    <Button variant="ghost" className="min-h-11" isDisabled={active?.pending} onPress={() => setConfirmingOwner(undefined)}>Cancel</Button></div>
            </div> : <Button variant="secondary" className="min-h-11" isDisabled={!data.ready || !available || Boolean(active?.pending)}
                onPress={() => setConfirmingOwner(`${user.id}:${contactId || ''}:${startDate || ''}:${endDate || ''}`)}>Index next {Math.min(available, data.batchSize)} recordings</Button>}
        </>}
        {(error || active?.error) && <p role="alert" className="text-danger">{active?.error || (error instanceof Error ? error.message : 'Could not check indexing.')}</p>}
        {active?.message && <p role="status">{active.message}</p>}
        <Button variant="ghost" className="min-h-11" onPress={() => { void mutate(); onUpdated(); }} isDisabled={active?.pending}>Refresh indexing status</Button>
    </div>;
}
