'use client';

import { useMemo, useRef, useState } from 'react';
import { Button } from '@heroui/react';
import { Copy, Download } from 'lucide-react';
import type { RecordingContentData } from '@/lib/recording-content-types';
import { transcriptDownloadName, transcriptPlainText } from '@/lib/transcript-export';

export function TranscriptExportActions({ recordingId, segments, transliterated }: {
    recordingId: string;
    segments: NonNullable<RecordingContentData['fullTranscript']>;
    transliterated: boolean;
}) {
    const text = useMemo(() => transcriptPlainText(segments, transliterated), [segments, transliterated]);
    const [copying, setCopying] = useState(false);
    const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
    const busy = useRef(false);

    const copy = async () => {
        if (!text || busy.current) return;
        busy.current = true;
        setCopying(true);
        setFeedback(null);
        try {
            if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
            await navigator.clipboard.writeText(text);
            setFeedback({ message: transliterated ? 'Transliteration copied.' : 'Transcript copied.' });
        } catch {
            setFeedback({ message: 'Could not copy the transcript. Use Download TXT to save it instead.', error: true });
        } finally {
            busy.current = false;
            setCopying(false);
        }
    };

    const download = () => {
        if (!text) return;
        let url: string | undefined;
        const anchor = document.createElement('a');
        try {
            url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
            anchor.href = url;
            anchor.download = transcriptDownloadName(recordingId, transliterated);
            document.body.append(anchor);
            anchor.click();
            setFeedback(null);
        } catch {
            setFeedback({ message: 'Could not download the transcript. Please try again.', error: true });
        } finally {
            anchor.remove();
            // Give the browser time to start reading the blob before releasing it.
            const objectUrl = url;
            if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        }
    };

    return <div className="mb-4 space-y-2">
        <div role="group" aria-label="Transcript export" className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" className="min-h-11 md:min-h-8" isDisabled={!text || copying} isPending={copying} onPress={copy}>
                <Copy className="size-4" aria-hidden="true" />Copy transcript
            </Button>
            <Button size="sm" variant="ghost" className="min-h-11 md:min-h-8" isDisabled={!text} onPress={download}>
                <Download className="size-4" aria-hidden="true" />Download TXT
            </Button>
        </div>
        {feedback && <p role={feedback.error ? 'alert' : 'status'} className={`text-sm ${feedback.error ? 'text-danger' : 'text-muted'}`}>{feedback.message}</p>}
    </div>;
}
