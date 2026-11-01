'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, Checkbox, Chip, Input, Label, ListBox, Select, Spinner, Tabs, TextField } from '@heroui/react';
import { AudioLines, Clock3, Play, RefreshCw, Save, Upload, X } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { TranscriptionBatchCard } from '@/components/pages/transcription/batch-card';
import { formatAudioDuration, formatRecordingDate } from '@/components/pages/transcription/format';
import { useUser } from '@/lib/auth/client';
import { authFetchJson } from '@/lib/api-client';
import { buildLoginRedirectHref } from '@/lib/auth-redirect';
import { useToast } from '@/components/toast-provider';
import { useUserProfile } from '@/hooks/use-user-profile';
import { mutateTranscriptionBatch, useTranscriptionWorkspace, type BatchMutation, type TranscriptionBatch, type WaitingTranscriptionRecording } from '@/hooks/use-transcription-workspace';

type WorkspaceTab = 'waiting' | 'saved' | 'history';
const MAX_BATCH_RECORDINGS = 1000;

export function TranscriptionPage() {
    const router = useRouter();
    const { user, isUserLoading } = useUser();
    const { userProfile } = useUserProfile(user);
    const { toast } = useToast();
    const workspace = useTranscriptionWorkspace(Boolean(user));
    const [tab, setTab] = useState<WorkspaceTab>('waiting');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [editingId, setEditingId] = useState<string>();
    const [name, setName] = useState('');
    const [provider, setProvider] = useState('');
    const [pending, setPending] = useState<string>();
    const [actionError, setActionError] = useState<string>();

    useEffect(() => {
        if (!isUserLoading && !user) router.replace(buildLoginRedirectHref('/transcription'));
    }, [isUserLoading, router, user]);

    const editingBatch = workspace.batches.find(batch => batch.id === editingId && batch.status === 'draft');
    const selectable = new Map<string, WaitingTranscriptionRecording>(workspace.waiting.map(recording => [recording.id, recording]));
    for (const recording of editingBatch?.recordings ?? []) selectable.set(recording.id, recording);
    const selected = [...selectedIds].map(id => selectable.get(id)).filter((recording): recording is WaitingTranscriptionRecording => Boolean(recording));
    const totalDuration = selected.reduce((sum, recording) => sum + (recording.duration || 0), 0);
    const defaultProvider = userProfile?.transcriptionSettings?.defaultProvider;
    const selectedProvider = provider || (workspace.providers.some(item => item.id === defaultProvider) ? defaultProvider : undefined) || workspace.providers[0]?.id || '';
    const providerAvailable = workspace.providers.some(item => item.id === selectedProvider);
    const groups = new Map<string, WaitingTranscriptionRecording[]>();
    for (const recording of selectable.values()) {
        const key = recording.dateKey || '';
        groups.set(key, [...(groups.get(key) ?? []), recording]);
    }
    const dateGroups = [...groups].sort(([first], [second]) => second.localeCompare(first)).map(([dateKey, recordings]) => ({
        dateKey: dateKey || null,
        recordings: recordings.sort((first, second) => second.recordedAt.localeCompare(first.recordedAt)),
    }));
    const saved = workspace.batches.filter(batch => batch.status !== 'completed');
    const history = workspace.batches.filter(batch => batch.status === 'completed');

    const toggleRecordings = (ids: string[], select: boolean) => {
        setSelectedIds(current => {
            const next = new Set(current);
            for (const id of ids) {
                if (select) next.add(id);
                else next.delete(id);
            }
            return next;
        });
    };

    const clearEditor = () => {
        setSelectedIds(new Set());
        setEditingId(undefined);
        setName('');
        setProvider('');
    };

    const editBatch = (batch: TranscriptionBatch) => {
        setEditingId(batch.id);
        setSelectedIds(new Set(batch.recordingIds));
        setName(batch.name);
        setProvider(batch.provider);
        setActionError(undefined);
        setTab('waiting');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const batchAction = async (id: string, mutation: BatchMutation) => {
        if (pending) return;
        setPending(id);
        setActionError(undefined);
        try {
            await mutateTranscriptionBatch(id, mutation);
            await workspace.mutate();
            toast({ title: mutation.action === 'remove' ? 'Batch removed. Recordings returned to Waiting.' : mutation.action === 'pause' ? 'Batch paused' : mutation.action === 'resume' || mutation.action === 'retry' || mutation.action === 'start' ? 'Batch started' : 'Batch updated', status: 'success' });
        } catch (cause) {
            setActionError(cause instanceof Error ? cause.message : 'Unable to update this batch.');
        } finally {
            setPending(undefined);
        }
    };

    const saveSelection = async (start: boolean) => {
        if (pending || !providerAvailable || selected.length === 0 || selected.length > MAX_BATCH_RECORDINGS) return;
        setPending('selection');
        setActionError(undefined);
        try {
            const payload = {
                recordingIds: selected.map(recording => recording.id),
                ...(name.trim() ? { name: name.trim() } : {}),
                ...(selectedProvider ? { provider: selectedProvider } : {}),
            };
            const result = editingBatch
                ? await mutateTranscriptionBatch(editingBatch.id, { action: 'edit', ...payload })
                : await authFetchJson<{ batch: TranscriptionBatch }>('/api/transcription/batches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const batchId = result.batch?.id || editingBatch?.id;
            if (!batchId) throw new Error('The batch could not be saved. Refresh and try again.');
            clearEditor();
            setTab('saved');
            if (start) await mutateTranscriptionBatch(batchId, { action: 'start' });
            toast({ title: start ? 'Batch started' : 'Batch saved for later', status: 'success' });
        } catch (cause) {
            setActionError(cause instanceof Error ? cause.message : 'Unable to save this batch.');
        } finally {
            await workspace.mutate().catch(() => undefined);
            setPending(undefined);
        }
    };

    const renderBatches = (batches: TranscriptionBatch[], empty: string) => batches.length ? (
        <div className="space-y-4">{batches.map(batch => <TranscriptionBatchCard key={batch.id} batch={batch} providerName={workspace.providers.find(item => item.id === batch.provider)?.name || batch.provider || 'Configured provider'} isPending={Boolean(pending)} onEdit={() => editBatch(batch)} onAction={mutation => batchAction(batch.id, mutation)} />)}</div>
    ) : <div className="rounded-xl border border-dashed border-border px-5 py-12 text-center text-sm text-muted">{empty}</div>;

    if (isUserLoading || !user) return <div className="flex justify-center p-8"><Spinner aria-label="Loading transcription workspace" /></div>;

    return (
        <div className="min-w-0 space-y-5">
            <PageHeader title="Transcription" description="Import recordings, save batches, and start each batch when you are ready." actions={<Button onPress={() => router.push('/transcription/import')}><Upload className="size-4" />Bulk import</Button>} />

            <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4 text-sm leading-6">
                <Clock3 className="mt-1 size-5 shrink-0 text-accent" aria-hidden="true" />
                <p>Bulk imports wait for you. Save a batch for another day, or start selected recordings now. Check your provider usage before starting the next batch.</p>
            </div>

            {(actionError || workspace.error) && <Alert status="danger">
                <Alert.Indicator />
                <Alert.Content>
                    <Alert.Title>{actionError ? 'Unable to update transcription' : 'Unable to load transcription'}</Alert.Title>
                    <Alert.Description>{actionError || workspace.error?.message}</Alert.Description>
                    <Button size="sm" variant="secondary" className="mt-3" onPress={() => void workspace.mutate().catch(() => undefined)}><RefreshCw className="size-4" />Refresh workspace</Button>
                </Alert.Content>
            </Alert>}

            {workspace.isLoading ? <div className="flex justify-center p-12"><Spinner aria-label="Loading waiting recordings" /></div> : <>
                <Tabs selectedKey={tab} onSelectionChange={key => setTab(key as WorkspaceTab)} className="min-w-0">
                    <Tabs.ListContainer className="max-w-full">
                        <Tabs.List aria-label="Transcription workspace" className="w-full min-w-0">
                            <Tabs.Tab id="waiting" className="min-h-12 min-w-0 flex-1 gap-1 px-2 text-xs sm:text-sm"><span className="min-w-0 text-center leading-4">Waiting recordings</span><span className="text-xs text-muted">{workspace.waitingTotal}</span><Tabs.Indicator /></Tabs.Tab>
                            <Tabs.Tab id="saved" className="min-h-12 min-w-0 flex-1 gap-1 px-2 text-xs sm:text-sm"><span className="min-w-0 text-center leading-4">Saved batches</span><span className="text-xs text-muted">{saved.length}</span><Tabs.Indicator /></Tabs.Tab>
                            <Tabs.Tab id="history" className="min-h-12 min-w-0 flex-1 gap-1 px-2 text-xs sm:text-sm"><span className="min-w-0 text-center leading-4">History</span><span className="text-xs text-muted">{history.length}</span><Tabs.Indicator /></Tabs.Tab>
                        </Tabs.List>
                    </Tabs.ListContainer>
                    <Tabs.Panel id="waiting" className="space-y-4 pt-5">
                        {editingBatch && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent/30 bg-accent/5 p-4">
                            <p className="text-sm">Editing <strong>{editingBatch.name}</strong>. Change its selection or add waiting recordings.</p>
                            <Button variant="ghost" size="sm" isDisabled={Boolean(pending)} onPress={clearEditor}><X className="size-4" />Cancel edit</Button>
                        </div>}
                        {selected.length > 0 && <Card className="rounded-xl border border-accent/30 bg-surface shadow-none">
                            <Card.Content className="space-y-4 p-4 md:p-5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <h2 className="text-base font-semibold">{editingBatch ? 'Edit batch' : 'Prepare a batch'}</h2>
                                    <Chip variant="soft" color="accent">{selected.length} selected · {formatAudioDuration(totalDuration)}</Chip>
                                </div>
                                <div className="grid gap-4 md:grid-cols-2">
                                    <TextField value={name} onChange={setName} isDisabled={Boolean(pending)} maxLength={100}>
                                        <Label>Batch name (optional)</Label>
                                        <Input placeholder="For example, October calls" />
                                    </TextField>
                                    <div className="space-y-2">
                                        <span className="text-sm font-medium">Transcription provider</span>
                                        <Select aria-label="Batch transcription provider" selectedKey={selectedProvider || null} onSelectionChange={key => setProvider(key ? String(key) : '')} isDisabled={Boolean(pending) || workspace.providers.length === 0} placeholder="No provider available">
                                            <Select.Trigger className="min-h-11"><Select.Value /><Select.Indicator /></Select.Trigger>
                                            <Select.Popover><ListBox>
                                                {selectedProvider && !providerAvailable && <ListBox.Item id={selectedProvider} textValue={`${selectedProvider} (unavailable)`}>{selectedProvider} (unavailable)</ListBox.Item>}
                                                {workspace.providers.map(item => <ListBox.Item key={item.id} id={item.id} textValue={item.name}>{item.name}</ListBox.Item>)}
                                            </ListBox></Select.Popover>
                                        </Select>
                                    </div>
                                </div>
                                <p className="text-xs leading-5 text-muted">Starting uses provider credits or allowance for transcription and related AI processing. This batch stops after its selected recordings; other batches wait.</p>
                                {selected.length > MAX_BATCH_RECORDINGS && <p className="text-sm text-warning">Choose up to {MAX_BATCH_RECORDINGS} recordings per batch.</p>}
                                <div className="flex flex-wrap gap-2">
                                    <Button variant="secondary" isDisabled={Boolean(pending) || !providerAvailable || selected.length > MAX_BATCH_RECORDINGS} onPress={() => void saveSelection(false)}><Save className="size-4" />{editingBatch ? 'Save changes' : 'Save batch'}</Button>
                                    <Button isDisabled={Boolean(pending) || !providerAvailable || selected.length > MAX_BATCH_RECORDINGS} onPress={() => void saveSelection(true)}><Play className="size-4" />Start selected recordings</Button>
                                    <Button variant="ghost" isDisabled={Boolean(pending)} onPress={() => editingBatch ? clearEditor() : setSelectedIds(new Set())}>Clear selection</Button>
                                </div>
                                {!providerAvailable && <p className="text-xs text-muted">Configure an available transcription provider before saving or starting a batch. Imported audio remains waiting.</p>}
                            </Card.Content>
                        </Card>}
                        {dateGroups.length === 0 ? <div className="space-y-3 rounded-xl border border-dashed border-border px-5 py-12 text-center">
                            <AudioLines className="mx-auto size-7 text-muted" aria-hidden="true" />
                            <h2 className="text-base font-semibold">No recordings waiting</h2>
                            <p className="text-sm text-muted">Bulk import audio here to prepare batches without starting AI processing.</p>
                            <Button variant="secondary" onPress={() => router.push('/transcription/import')}>Bulk import recordings</Button>
                        </div> : <>
                            <p className="text-xs leading-5 text-muted">Grouped by the recording date in each filename, newest first. Each batch contains one recording date; clear your selection to choose a different date. Files without a recognized date are kept separately.{workspace.waitingTotal > workspace.waiting.length ? ` Showing ${workspace.waiting.length} of ${workspace.waitingTotal} waiting recordings. Date selections include loaded recordings only.` : ''}</p>
                            {dateGroups.map(group => {
                                const ids = group.recordings.map(recording => recording.id);
                                const selectedCount = ids.filter(id => selectedIds.has(id)).length;
                                const label = formatRecordingDate(group.dateKey);
                                const groupDisabled = Boolean(pending) || (editingBatch ? group.dateKey !== editingBatch.dateKey : selected.length > 0 && group.dateKey !== selected[0].dateKey);
                                return <Card key={group.dateKey || 'unknown'} className="gap-0 rounded-xl border border-border bg-surface shadow-none">
                                    <Card.Content className="p-0">
                                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2 md:px-5">
                                            <Checkbox aria-label={`Select ${workspace.waitingTotal > workspace.waiting.length ? 'loaded recordings from ' : ''}${label}`} isSelected={selectedCount === ids.length} isIndeterminate={selectedCount > 0 && selectedCount < ids.length} onChange={value => toggleRecordings(ids, value)} isDisabled={groupDisabled}>
                                                <Checkbox.Content className="min-h-11 gap-3"><Checkbox.Control><Checkbox.Indicator /></Checkbox.Control><h2 className="text-sm font-semibold md:text-base">{label}</h2></Checkbox.Content>
                                            </Checkbox>
                                            <span className="pl-8 text-xs text-muted md:pl-0">{ids.length} recording{ids.length === 1 ? '' : 's'} · {formatAudioDuration(group.recordings.reduce((sum, recording) => sum + (recording.duration || 0), 0))}</span>
                                        </div>
                                        <ul className="divide-y divide-border">
                                            {group.recordings.map(recording => <li key={recording.id} className="flex items-center gap-3 px-3 py-2 md:px-5">
                                                <Checkbox aria-label={`Select ${recording.fileName}`} isSelected={selectedIds.has(recording.id)} onChange={value => toggleRecordings([recording.id], value)} isDisabled={groupDisabled}>
                                                    <Checkbox.Content className="min-h-11 min-w-6"><Checkbox.Control><Checkbox.Indicator /></Checkbox.Control></Checkbox.Content>
                                                </Checkbox>
                                                <div className="min-w-0 flex-1">
                                                    <p className="break-words text-sm font-medium">{recording.displayName || recording.fileName}</p>
                                                    {recording.displayName && recording.displayName !== recording.fileName && <p className="break-all text-xs leading-5 text-muted">{recording.fileName}</p>}
                                                </div>
                                                <span className="shrink-0 text-xs tabular-nums text-muted">{formatAudioDuration(recording.duration)}</span>
                                            </li>)}
                                        </ul>
                                    </Card.Content>
                                </Card>;
                            })}
                        </>}
                    </Tabs.Panel>
                    <Tabs.Panel id="saved" className="space-y-4 pt-5">
                        <p className="text-sm leading-6 text-muted">Start any saved batch when you are ready. Pausing stops further submissions while work already sent to a provider finishes.</p>
                        {renderBatches(saved, 'No saved batches. Select waiting recordings and save a batch to return to later.')}
                    </Tabs.Panel>
                    <Tabs.Panel id="history" className="pt-5">{renderBatches(history, 'Completed batches will appear here.')}</Tabs.Panel>
                </Tabs>
                {workspace.hasMore && <div className="flex justify-center pt-2"><Button variant="secondary" isPending={workspace.isValidating} onPress={() => void workspace.loadMore().catch(() => undefined)}>Load more {tab === 'waiting' ? 'recordings' : 'batches'}</Button></div>}
            </>}
        </div>
    );
}
