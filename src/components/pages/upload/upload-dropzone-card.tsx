'use client';

import React from 'react';
import { Button, Card } from '@heroui/react';
import { UploadCloud } from 'lucide-react';

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
        <Card className="bg-card/70 backdrop-blur-xl border border-default-200/50 shadow-lg md:shadow-xl overflow-visible rounded-xl md:rounded-2xl">
            <Card.Content className="p-4 sm:p-8">
                <div
                    className={`group relative flex flex-col items-center justify-center p-8 sm:p-12 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-300 ${
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
                        className={`absolute inset-0 bg-grid-default-200/20 [mask-image:linear-gradient(0deg,transparent,black)] pointer-events-none rounded-2xl transition-opacity duration-300 ${
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

                    <div className="flex items-center gap-2 mb-6 px-3 py-1 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 rounded-full border border-yellow-500/20">
                        <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
                        <p className="text-xs font-semibold text-center">Max file size: 2GB per file</p>
                    </div>

                    <div className="flex flex-wrap justify-center gap-3 text-xs text-default-400 font-mono bg-default-100/50 px-4 py-2 rounded-xl backdrop-blur-sm border border-default-200/50">
                        <span>MP3</span>
                        <span className="w-px h-3 bg-default-300/50" />
                        <span>WAV</span>
                        <span className="w-px h-3 bg-default-300/50" />
                        <span>M4A</span>
                        <span className="w-px h-3 bg-default-300/50" />
                        <span>MP4</span>
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
            </Card.Content>
        </Card>
    );
}
