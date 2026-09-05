'use client';

import { Card } from '@heroui/react';
import { CheckCircle2, File, HardDriveUpload, Sparkles } from 'lucide-react';

export function UploadEmptyState() {
    return (
        <Card className="min-h-[360px] rounded-[2rem] border border-default-200/80 bg-background/95 shadow-[0_20px_54px_-44px_rgba(15,23,42,0.45)]">
            <Card.Content className="flex h-full flex-col justify-center p-6 sm:p-8">
                <div className="mx-auto max-w-2xl text-center">
                    <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-default-100 mb-4">
                        <File className="w-8 h-8 text-default-300" />
                    </div>
                    <h3 className="text-2xl font-bold tracking-[-0.03em] text-foreground">
                        No files added yet
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-default-500">
                        Add files from the dropzone to see them here before uploading.
                    </p>
                </div>

                <div className="mt-8 grid gap-4 md:grid-cols-3">
                    {[
                        {
                            icon: HardDriveUpload,
                            title: '1. Add files',
                            description: 'Drop or select audio files to stage them.',
                        },
                        {
                            icon: CheckCircle2,
                            title: '2. Review the queue',
                            description: 'Check names, sizes, and any flagged duplicates.',
                        },
                        {
                            icon: Sparkles,
                            title: '3. Upload',
                            description: 'Send the batch and track progress in the queue.',
                        },
                    ].map((item) => {
                        const Icon = item.icon;

                        return (
                            <div
                                key={item.title}
                                className="rounded-[1.5rem] border border-default-200/80 bg-default-50/70 p-5 text-left"
                            >
                                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-background text-primary">
                                    <Icon className="h-5 w-5" />
                                </div>
                                <div className="font-semibold text-foreground">{item.title}</div>
                                <p className="mt-2 text-sm leading-6 text-default-500">{item.description}</p>
                            </div>
                        );
                    })}
                </div>
            </Card.Content>
        </Card>
    );
}
