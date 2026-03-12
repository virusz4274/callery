'use client';

import React from 'react';
import { Button, Card, Chip, Surface } from '@heroui/react';
import { ArrowRight, ShieldCheck, UploadCloud } from 'lucide-react';

type UploadDropzoneCardProps = {
    isDragging: boolean;
    onDragEnter: () => void;
    onDragLeave: () => void;
    onDropFiles: (files: File[]) => void;
    onSelectFiles: (files: File[]) => void;
};

export function UploadDropzoneCard({
    isDragging,
    onDragEnter,
    onDragLeave,
    onDropFiles,
    onSelectFiles,
}: UploadDropzoneCardProps) {
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files) {
            onSelectFiles(Array.from(event.target.files));
        }
    };

    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        onDragLeave();

        if (event.dataTransfer.files) {
            onDropFiles(Array.from(event.dataTransfer.files));
        }
    };

    const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        onDragEnter();
    };

    const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        onDragLeave();
    };

    return (
        <Card className="overflow-visible rounded-[1.9rem] border border-default-200/80 bg-background/95 shadow-[0_24px_64px_-48px_rgba(15,23,42,0.45)]">
            <Card.Content className="p-5 sm:p-6">
                <div className="mb-5 space-y-3">
                    <Chip variant="soft" color="accent" className="rounded-full px-3 py-1 text-xs font-medium">
                        Add files
                    </Chip>
                    <div>
                        <h2 className="text-2xl font-bold tracking-[-0.03em] text-foreground">
                            Stage audio before you send it.
                        </h2>
                        <p className="mt-2 text-sm leading-6 text-default-600">
                            Drop files here or browse locally. The queue on the right will show what
                            is ready, what uploaded cleanly, and what needs retry.
                        </p>
                    </div>
                </div>

                <div
                    className={`group relative flex flex-col items-center justify-center p-8 sm:p-12 border-2 border-dashed rounded-[1.75rem] cursor-pointer transition-all duration-300 ${
                        isDragging
                            ? 'border-primary bg-primary/10 scale-[1.01]'
                            : 'border-default-200 hover:border-primary bg-gradient-to-b from-default-50/50 to-transparent hover:from-primary/5 hover:to-primary/5'
                    }`}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={() => fileInputRef.current?.click()}
                    >
                        <div
                        className={`absolute inset-0 bg-grid-default-200/20 [mask-image:linear-gradient(0deg,transparent,black)] pointer-events-none rounded-[1.75rem] transition-opacity duration-300 ${
                            isDragging ? 'opacity-50' : 'opacity-100'
                        }`}
                    />

                    <div
                        className={`h-16 w-16 sm:h-20 sm:w-20 mb-4 sm:mb-6 rounded-3xl flex items-center justify-center transition-all duration-300 shadow-xl ${
                            isDragging
                                ? 'bg-primary text-primary-foreground scale-110 rotate-0 shadow-primary/30'
                                : 'bg-default-100 text-default-400 group-hover:bg-primary group-hover:text-primary-foreground group-hover:scale-110 group-hover:rotate-3 group-hover:shadow-primary/30'
                        }`}
                    >
                        <UploadCloud className="h-8 w-8 sm:h-10 sm:w-10 transition-colors duration-300" />
                    </div>

                    <h3
                        className={`text-xl font-bold mb-2 transition-colors text-center ${
                            isDragging ? 'text-primary' : 'text-foreground group-hover:text-primary'
                        }`}
                    >
                        {isDragging ? 'Drop files to upload' : 'Drag & drop files here'}
                    </h3>
                    <p className="text-sm text-default-500 mb-2 max-w-sm text-center px-4">or click to browse</p>

                    <Button variant="secondary" className="mb-5 rounded-full px-5 font-medium">
                        Choose files
                        <ArrowRight className="h-4 w-4" />
                    </Button>

                    <div className="mb-5 flex items-center gap-2 rounded-full border border-yellow-500/20 bg-yellow-500/10 px-3 py-1 text-yellow-600 dark:text-yellow-400">
                        <span className="h-2 w-2 rounded-full bg-current animate-pulse" />
                        <p className="text-xs font-semibold text-center">Max file size: 5 GiB per file</p>
                    </div>

                    <div className="flex flex-wrap justify-center gap-2 text-xs text-default-500">
                        {['MP3', 'WAV', 'M4A', 'MP4', 'MOV'].map((format) => (
                            <span
                                key={format}
                                className="rounded-full border border-default-200 bg-default-100/70 px-3 py-1 font-medium"
                            >
                                {format}
                            </span>
                        ))}
                    </div>

                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={handleFileChange}
                        accept="audio/*,video/*,.m4a,.mp3,.wav,.mp4"
                    />
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <Surface variant="secondary" className="rounded-[1.25rem] border border-default-200/80 p-4">
                        <div className="space-y-1">
                            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                                Intake tip
                            </div>
                            <p className="text-sm leading-6 text-default-600">
                                Add the whole batch first, then review the queue before you start the upload.
                            </p>
                        </div>
                    </Surface>
                    <Surface variant="secondary" className="rounded-[1.25rem] border border-default-200/80 p-4">
                        <div className="flex items-start gap-3">
                            <ShieldCheck className="mt-0.5 h-4 w-4 text-success" />
                            <p className="text-sm leading-6 text-default-600">
                                Uploads go straight to storage and remain visible in the queue until they complete.
                            </p>
                        </div>
                    </Surface>
                </div>
            </Card.Content>
        </Card>
    );
}
