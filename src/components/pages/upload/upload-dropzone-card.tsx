'use client';

import React from 'react';
import { Button, Card, Chip } from '@heroui/react';
import { ArrowRight, UploadCloud } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UPLOAD_AUDIO_ACCEPT_ATTRIBUTE, UPLOAD_AUDIO_FORMAT_LABELS } from '@/lib/upload-audio-support';

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
    const fileInputId = React.useId();

    const openFilePicker = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files ? Array.from(event.target.files) : [];

        if (files.length > 0) {
            onSelectFiles(files);
        }

        // Allow selecting the same file again after it is removed or uploaded.
        event.target.value = '';
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

    const handleBrowseKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openFilePicker();
        }
    };

    return (
        <Card className="overflow-visible rounded-[2rem] border border-default-200/80 bg-background/95 shadow-[0_20px_54px_-44px_rgba(15,23,42,0.45)]">
            <Card.Content className="p-5 sm:p-6">
                <div className="mb-5">
                    <Chip variant="soft" color="accent" size="sm">
                        Add files
                    </Chip>
                </div>

                <div
                    className={cn(
                        'group relative flex flex-col items-center justify-center p-8 sm:p-12 border-2 border-dashed rounded-[1.5rem] cursor-pointer transition-all duration-300',
                        isDragging
                            ? 'border-primary bg-primary/10 scale-[1.01]'
                            : 'border-default-200 hover:border-primary bg-gradient-to-b from-default-50/50 to-transparent hover:from-primary/5 hover:to-primary/5'
                    )}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={openFilePicker}
                    onKeyDown={handleBrowseKeyDown}
                    role="button"
                    tabIndex={0}
                    aria-label="Choose audio files to upload"
                >
                    <div
                        className={cn(
                            'absolute inset-0 bg-grid-default-200/20 [mask-image:linear-gradient(0deg,transparent,black)] pointer-events-none rounded-[1.5rem] transition-opacity duration-300',
                            isDragging ? 'opacity-50' : 'opacity-100'
                        )}
                    />

                    <div
                        className={cn(
                            'h-16 w-16 sm:h-20 sm:w-20 mb-4 sm:mb-6 rounded-2xl flex items-center justify-center transition-all duration-300 shadow-md',
                            isDragging
                                ? 'bg-primary text-primary-foreground scale-110 rotate-0 shadow-primary/30'
                                : 'bg-default-100 text-default-400 group-hover:bg-primary group-hover:text-primary-foreground group-hover:scale-110 group-hover:rotate-3 group-hover:shadow-primary/30'
                        )}
                    >
                        <UploadCloud className="h-8 w-8 sm:h-10 sm:w-10 transition-colors duration-300" />
                    </div>

                    <h3
                        className={cn(
                            'text-xl font-semibold mb-2 transition-colors text-center',
                            isDragging ? 'text-primary' : 'text-foreground group-hover:text-primary'
                        )}
                    >
                        {isDragging ? 'Drop files to upload' : 'Drag & drop files here'}
                    </h3>
                    <p className="text-sm text-default-500 mb-2 max-w-sm text-center px-4">or click to browse</p>

                    <Button
                        onPress={openFilePicker}
                        onClick={(e) => e.stopPropagation()}
                        className="mb-5 rounded-full px-6 font-semibold"
                    >
                        Choose files
                        <ArrowRight className="h-4 w-4" />
                    </Button>

                    <Chip variant="soft" color="warning" size="sm" className="mb-5">
                        Max 5 GiB per file
                    </Chip>

                    <div className="flex flex-wrap justify-center gap-2">
                        {UPLOAD_AUDIO_FORMAT_LABELS.map((format) => (
                            <Chip key={format} variant="soft" color="default" size="sm">
                                {format}
                            </Chip>
                        ))}
                    </div>

                    <input
                        id={fileInputId}
                        ref={fileInputRef}
                        type="file"
                        multiple
                        className="sr-only"
                        onChange={handleFileChange}
                        accept={UPLOAD_AUDIO_ACCEPT_ATTRIBUTE}
                    />
                </div>

            </Card.Content>
        </Card>
    );
}
