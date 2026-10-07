'use client';

import { FileAudio } from 'lucide-react';

export function UploadEmptyState() {
    return <div className="flex items-center justify-center gap-3 rounded-xl border border-border p-6 text-sm text-muted">
        <FileAudio className="size-5 shrink-0" aria-hidden="true" />
        <p>Choose audio files to add them to the upload queue.</p>
    </div>;
}
