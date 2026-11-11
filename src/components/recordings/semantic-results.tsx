'use client';

import { Button } from '@heroui/react';
import { Play } from 'lucide-react';
import type { Recording } from '@/lib/types';
import type { SemanticSearchMatch } from '@/lib/search/types';
import type { TranscriptTarget } from '@/lib/transcript-navigation';
import { getRecordingCallerLabel } from '@/lib/recording-label';
import { ClientFormattedDate } from '@/components/client-formatted-date';

export function SemanticResults({ recordings, matches, onOpen, page, hasMore, pending, onPageChange }: {
    recordings: Recording[]; matches: Record<string, SemanticSearchMatch[]>;
    onOpen: (recording: Recording, target?: TranscriptTarget) => void;
    page: number; hasMore: boolean; pending: boolean; onPageChange: (page: number) => void;
}) {
    return <div className="space-y-4" aria-busy={pending}>
        {!recordings.length && <p className="rounded-xl border border-border px-4 py-12 text-center text-sm text-muted">No matching conversations. Try different words or widen your contact and date filters.</p>}
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface" aria-label="Conversation search results">
            {recordings.map(recording => <li key={recording.id} className="p-4 md:p-5">
                <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <button type="button" className="min-h-11 break-words text-left font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-accent" onClick={() => onOpen(recording)}>{getRecordingCallerLabel(recording)}</button>
                        <p className="text-xs text-muted"><ClientFormattedDate date={recording.recordedAt} formatString="MMM d, yyyy · p" /></p>
                    </div>
                    <Button variant="secondary" className="min-h-11 shrink-0" aria-label={`Play ${getRecordingCallerLabel(recording)}`} onPress={() => onOpen(recording, { start: 0 })}><Play className="size-4" />Play</Button>
                </div>
                <div className="space-y-2">
                    {(matches[recording.id] || []).map((match, index) => <button key={`${match.segmentIndex}-${index}`} type="button"
                        onClick={() => onOpen(recording, { segmentIndex: match.segmentIndex, start: match.start, transcriptRevision: match.transcriptRevision })}
                        className="block w-full rounded-lg border-l-2 border-accent/40 bg-surface-secondary px-3 py-3 text-left transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-accent">
                        <span className="mb-1 block text-xs font-medium text-accent">{match.start !== undefined ? `${Math.floor(match.start / 60)}:${String(Math.floor(match.start % 60)).padStart(2, '0')} · Open passage` : 'Open matching passage'}</span>
                        <span className="line-clamp-5 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{match.text}</span>
                    </button>)}
                    {!matches[recording.id]?.length && <button type="button" className="min-h-11 text-left text-sm text-muted hover:text-foreground" onClick={() => onOpen(recording)}>{recording.summary || 'Open recording to review this match.'}</button>}
                </div>
            </li>)}
        </ul>
        {(recordings.length > 0 || page > 1) && <nav className="flex items-center justify-between gap-3" aria-label="Conversation search pages">
            <Button variant="secondary" className="min-h-11" isDisabled={page <= 1 || pending} onPress={() => onPageChange(page - 1)}>Previous</Button>
            <span className="text-sm text-muted">Page {page}</span>
            <Button variant="secondary" className="min-h-11" isDisabled={!hasMore || pending} onPress={() => onPageChange(page + 1)}>Next</Button>
        </nav>}
    </div>;
}
