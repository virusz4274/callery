'use client';

import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { recordingPreview } from '@/lib/recording-summary';
import { getRecordingCallerLabel } from '@/lib/recording-label';
import { SummaryContent } from '@/components/recording-view/summary-content';
import type { Recording } from '@/lib/types';
import { Button } from '@heroui/react';

const SummaryExpansionContext = createContext<{
    expandedId: string | null;
    setExpandedId: (id: string | null) => void;
} | null>(null);

export function SummaryExpansionProvider({ children }: { children: ReactNode }) {
    const [expandedId, setExpandedId] = useState<string | null>(null);
    return <SummaryExpansionContext.Provider value={{ expandedId, setExpandedId }}>{children}</SummaryExpansionContext.Provider>;
}

export function SummaryPreview({ recording, density = 'comfortable', canExpand = true }: {
    recording: Recording;
    density?: 'comfortable' | 'dense';
    canExpand?: boolean;
}) {
    const expansion = useContext(SummaryExpansionContext);
    const [localExpandedId, setLocalExpandedId] = useState<string | null>(null);
    const expandedId = expansion?.expandedId ?? localExpandedId;
    const setExpandedId = expansion?.setExpandedId ?? setLocalExpandedId;
    const id = useId();
    const expanded = canExpand && expandedId === id;
    const root = useRef<HTMLDivElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        if (!expanded) return;
        const dismiss = (event: MouseEvent) => {
            if (event.target instanceof Node && !root.current?.contains(event.target)) setExpandedId(null);
        };
        const escape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                setExpandedId(null);
                trigger.current?.focus();
            }
        };
        // Wait for a completed click so collapsing a tall row cannot move the
        // next summary's button between pointer-down and pointer-up.
        document.addEventListener('click', dismiss, true);
        document.addEventListener('keydown', escape);
        return () => {
            document.removeEventListener('click', dismiss, true);
            document.removeEventListener('keydown', escape);
        };
    }, [expanded, setExpandedId]);

    return <div ref={root} className="min-w-0">
        <div id={`${id}-content`} role={expanded ? 'region' : undefined} aria-label={expanded ? `Full summary for ${getRecordingCallerLabel(recording)}` : undefined} className="text-sm leading-5 text-foreground">
            {expanded ? <SummaryContent text={recording.summary!} /> : <p className="recording-preview" data-lines={density === 'dense' ? 2 : 3}>{recordingPreview(recording) || 'No conversation preview yet'}</p>}
        </div>
        {canExpand && recording.summary?.trim() && <Button ref={trigger} variant="ghost" size="sm" type="button" aria-expanded={expanded} aria-controls={`${id}-content`}
            aria-label={`${expanded ? 'Collapse' : 'Show full'} summary for ${getRecordingCallerLabel(recording)}`}
            className="mt-1 min-h-11 text-accent lg:min-h-8"
            onPress={() => setExpandedId(expanded ? null : id)}>{expanded ? 'Less' : 'More'}</Button>}
    </div>;
}
