'use client';

import React from 'react';
import { Button, Card } from '@heroui/react';
import { UploadCloud } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UPLOAD_AUDIO_ACCEPT_ATTRIBUTE, UPLOAD_AUDIO_FORMAT_LABELS } from '@/lib/upload-audio-support';

type UploadDropzoneCardProps = {
    isDragging: boolean;
    onDragEnter: () => void;
    onDragLeave: () => void;
    onDropFiles: (files: File[]) => void;
    onSelectFiles: (files: File[]) => void;
};

export function UploadDropzoneCard({ isDragging, onDragEnter, onDragLeave, onDropFiles, onSelectFiles }: UploadDropzoneCardProps) {
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const fileInputId = React.useId();

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files ? Array.from(event.target.files) : [];
        if (files.length > 0) onSelectFiles(files);
        event.target.value = '';
    };

    return (
        <Card className="rounded-xl border border-border bg-surface p-3 shadow-none md:p-6">
            <Card.Content className="p-0">
                <div
                    className={cn('flex flex-col items-center justify-center rounded-xl px-3 py-3 md:min-h-80 md:border-2 md:border-dashed md:px-5 md:py-10 text-center transition-colors',
                        isDragging ? 'border-accent bg-accent/5' : 'border-border bg-surface-secondary/40')}
                    onDragEnter={(event) => { event.preventDefault(); event.stopPropagation(); onDragEnter(); }}
                    onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); }}
                    onDragLeave={(event) => {
                        event.preventDefault();
                        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onDragLeave();
                    }}
                    onDrop={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onDragLeave();
                        onDropFiles(Array.from(event.dataTransfer.files));
                    }}
                >
                    <div className="mb-5 hidden size-14 md:flex items-center justify-center rounded-2xl bg-accent/10 text-accent">
                        <UploadCloud className="size-7" aria-hidden="true" />
                    </div>
                    <h2 className="text-lg font-semibold"><span className="md:hidden">Add audio from your device</span><span className="hidden md:inline">{isDragging ? 'Drop your recordings here' : 'Drag & drop your recordings'}</span></h2>
                    <p className="mt-2 hidden text-sm text-muted md:block">Or choose audio files from your device.</p>
                    <Button className="mt-3 min-h-11 w-full md:mt-6 md:w-auto" onPress={() => fileInputRef.current?.click()} aria-controls={fileInputId}>
                        <UploadCloud className="size-4" />Choose files
                    </Button>
                    <p className="mt-3 text-xs leading-5 text-muted md:mt-5">{UPLOAD_AUDIO_FORMAT_LABELS.join(' · ')}</p>
                    <p className="mt-1 text-xs text-muted">Up to 5 GiB per file</p>
                    <input id={fileInputId} ref={fileInputRef} type="file" multiple className="sr-only" tabIndex={-1}
                        aria-label="Audio files" onChange={handleFileChange} accept={UPLOAD_AUDIO_ACCEPT_ATTRIBUTE} />
                </div>
            </Card.Content>
        </Card>
    );
}
