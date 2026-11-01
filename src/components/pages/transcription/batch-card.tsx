'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button, Card, Checkbox, Chip } from '@heroui/react';
import { CheckCircle2, ChevronDown, CircleAlert, Pause, Pencil, Play, Trash2 } from 'lucide-react';
import type { BatchMutation, TranscriptionBatch } from '@/hooks/use-transcription-workspace';
import { formatAudioDuration, formatRecordingDate } from './format';
import { enrichmentNeedsResume } from '@/lib/transcription/processing-errors';

const statusLabels = {
    draft: 'Saved for later',
    running: 'Running',
    paused: 'Paused',
    completed: 'Completed',
    needs_review: 'Needs review',
};

type Props = {
    batch: TranscriptionBatch;
    providerName: string;
    isPending: boolean;
    onEdit: () => void;
    onAction: (mutation: BatchMutation) => Promise<void>;
};

export function TranscriptionBatchCard({ batch, providerName, isPending, onEdit, onAction }: Props) {
    const [showRecordings, setShowRecordings] = useState(false);
    const [reviewedProvider, setReviewedProvider] = useState(false);
    const unsafeRecordings = batch.recordings?.filter(recording => recording.jobState === 'failed' || recording.jobState === 'needs_review') ?? [];
    const uncertain = unsafeRecordings.some(recording => recording.processingStatus?.providerOutcome === 'unknown'
        || recording.jobState === 'needs_review' && !recording.processingStatus);
    const enrichmentOnly = unsafeRecordings.length > 0 && unsafeRecordings.every(recording => enrichmentNeedsResume(recording.processingStatus));
    const administratorReview = unsafeRecordings.some(recording => recording.processingStatus
        && ['contact_admin', 'none'].includes(recording.processingStatus.retryAction || ''));
    const operatingUnavailable = unsafeRecordings.some(recording => recording.processingStatus?.code === 'operating_funds_unavailable');
    const hasCode = (code: string) => unsafeRecordings.some(recording => recording.processingStatus?.code === code);
    const count = batch.recordingIds.length;
    const completed = batch.completedCount ?? 0;
    const percent = count ? Math.min(100, Math.round(completed / count * 100)) : 0;

    return (
        <Card className="gap-0 rounded-xl border border-border bg-surface shadow-none" aria-label={`Batch ${batch.name}`}>
            <Card.Content className="space-y-4 p-4 md:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="break-words text-base font-semibold">{batch.name}</h2>
                            <Chip size="sm" variant="soft" color={batch.status === 'completed' ? 'success' : batch.status === 'needs_review' ? 'warning' : batch.status === 'running' ? 'accent' : 'default'}>
                                {statusLabels[batch.status]}
                            </Chip>
                        </div>
                        <p className="break-words text-sm text-muted">{count} recording{count === 1 ? '' : 's'} · {formatAudioDuration(batch.totalDuration)} · {providerName}{batch.model ? ` · ${batch.model}` : ''}</p>
                        {batch.dateKey && <p className="text-xs text-muted">{formatRecordingDate(batch.dateKey)}</p>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {batch.status === 'draft' && <>
                            <Button size="sm" variant="secondary" isDisabled={isPending} onPress={onEdit}><Pencil className="size-4" />Edit batch</Button>
                            <Button size="sm" isDisabled={isPending} onPress={() => void onAction({ action: 'start' })}><Play className="size-4" />Start batch</Button>
                            <Button size="sm" variant="ghost" isDisabled={isPending} aria-label={`Remove batch ${batch.name}`} onPress={() => void onAction({ action: 'remove' })}><Trash2 className="size-4" /><span className="sr-only">Remove batch</span></Button>
                        </>}
                        {batch.status === 'running' && <Button size="sm" variant="secondary" isDisabled={isPending} onPress={() => void onAction({ action: 'pause' })}><Pause className="size-4" />Pause batch</Button>}
                        {batch.status === 'paused' && <Button size="sm" isDisabled={isPending} onPress={() => void onAction({ action: 'resume' })}><Play className="size-4" />Resume batch</Button>}
                    </div>
                </div>
                {batch.status !== 'draft' && (
                    <div className="space-y-2" aria-live="polite">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                            <span>{completed} of {count} completed</span>
                            {batch.failedCount > 0 && <span className="text-warning">{batch.failedCount} need attention</span>}
                        </div>
                        <div role="progressbar" aria-label={`${batch.name} progress`} aria-valuenow={completed} aria-valuemin={0} aria-valuemax={count} className="h-2 overflow-hidden rounded-full bg-surface-secondary">
                            <div className="h-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
                        </div>
                        {batch.status === 'paused' && <p className="text-xs leading-5 text-muted">Further submissions are paused. Any recording already sent to the provider will finish.</p>}
                        {batch.status === 'completed' && <p className="flex items-center gap-2 text-xs text-muted"><CheckCircle2 className="size-4 text-success" />Finished. Other saved batches will wait until you start them.</p>}
                    </div>
                )}
                {(batch.error || batch.status === 'needs_review') && (
                    <div className="space-y-3 rounded-lg border border-warning/30 bg-warning/5 p-3">
                        <p className="flex items-start gap-2 text-sm leading-6"><CircleAlert className="mt-1 size-4 shrink-0 text-warning" />{batch.error || 'Processing stopped. Review the provider outcome before retrying this batch.'}</p>
                        {batch.status === 'needs_review' && unsafeRecordings.length > 0 && <>
                            <p className="text-xs leading-5 text-muted">{enrichmentOnly ? 'The audio transcript is saved. Resume only unfinished enrichment; audio is not transcribed or charged again.' : 'Existing transcripts are kept; only unfinished work is retried.'}</p>
                            {hasCode('insufficient_prepaid_credit') && <p className="text-xs leading-5 text-muted">Add prepaid usage credit in <Link href="/settings?tab=billing" className="underline">Billing &amp; Plans</Link> before retrying chargeable audio.</p>}
                            {hasCode('processing_paused') && <p className="text-xs leading-5 text-muted">The operator has paused AI processing. Resume after the pause is lifted; your saved files remain available.</p>}
                            {hasCode('provider_quota') && <p className="text-xs leading-5 text-muted">The AI provider reached a quota or rate limit. Contact support or retry when the provider limit resets.</p>}
                            {(hasCode('provider_configuration') || hasCode('processing_configuration')) && <p className="text-xs leading-5 text-muted">Ask your administrator to check the configured provider, model, and credentials.</p>}
                            {uncertain && <Checkbox isSelected={reviewedProvider} onChange={setReviewedProvider} isDisabled={isPending}>
                                <Checkbox.Content className="min-h-11 items-center gap-3">
                                    <Checkbox.Control><Checkbox.Indicator /></Checkbox.Control>
                                    <span className="text-sm leading-6">I checked the provider outcome; retrying may incur another charge.</span>
                                </Checkbox.Content>
                            </Checkbox>}
                            {administratorReview && <p className="text-xs leading-5 text-muted">{operatingUnavailable
                                ? 'Processing is temporarily unavailable. Contact support to restore processing. Your saved files are retained.'
                                : 'Contact your administrator to reconcile this processing result before retrying.'}</p>}
                            <Button size="sm" variant="secondary" isDisabled={administratorReview || uncertain && !reviewedProvider || isPending} onPress={async () => {
                                await onAction({ action: 'retry', recordingIds: unsafeRecordings.map(recording => recording.id), acknowledgeProviderOutcome: uncertain });
                                setReviewedProvider(false);
                            }}>{enrichmentOnly ? 'Resume enrichment' : 'Retry unfinished recordings'}</Button>
                        </>}
                    </div>
                )}
                {Boolean(batch.recordings?.length) && (
                    <div>
                        <Button size="sm" variant="ghost" className="min-h-11 px-0" onPress={() => setShowRecordings(value => !value)} aria-expanded={showRecordings}>
                            {showRecordings ? 'Hide recordings' : 'View recordings'}<ChevronDown className={`size-4 transition-transform ${showRecordings ? 'rotate-180' : ''}`} />
                        </Button>
                        {showRecordings && <ul className="mt-2 divide-y divide-border">
                            {batch.recordings?.map(recording => {
                                const needsReview = recording.jobState === 'needs_review' || recording.jobState === 'failed';
                                const label = recording.processingProgress?.transcriptAvailable && !['not_started', 'completed'].includes(recording.processingProgress.enrichmentState) ? `Transcript saved · ${recording.processingProgress.enrichmentState === 'running' ? 'Enriching' : recording.processingProgress.enrichmentState === 'pending' ? 'Queued for AI' : 'AI needs attention'}` : recording.processingStatus?.state === 'blocked' ? `${recording.processingStatus.stage}: blocked`
                                    : needsReview ? 'Needs review' : recording.jobState === 'submitted' ? 'Awaiting provider' : recording.jobState === 'running' ? 'Processing' : recording.jobState === 'completed' || recording.status === 'completed' ? 'Completed' : recording.status === 'failed' ? 'Failed' : 'Waiting';
                                return <li key={recording.id} className="flex flex-wrap items-start justify-between gap-2 py-3 text-sm">
                                    <div className="min-w-0 flex-1 space-y-1">
                                        <Link href={`/recordings?id=${encodeURIComponent(recording.id)}`} className="break-all font-medium hover:underline">{recording.fileName}</Link>
                                        {recording.error && <p className="break-words text-xs text-warning">{recording.error}</p>}
                                    </div>
                                    <span className="text-xs text-muted">{formatAudioDuration(recording.duration)} · {label}</span>
                                </li>;
                            })}
                        </ul>}
                    </div>
                )}
            </Card.Content>
        </Card>
    );
}
