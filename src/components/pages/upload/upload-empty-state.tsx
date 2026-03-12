'use client';

import { Card } from '@heroui/react';
import { CheckCircle2, File, HardDriveUpload, Sparkles } from 'lucide-react';

export function UploadEmptyState() {
    return (
        <Card className="min-h-[360px] rounded-[1.9rem] border border-default-200/80 bg-background/95 shadow-[0_24px_64px_-48px_rgba(15,23,42,0.45)]">
            <Card.Content className="flex h-full flex-col justify-center p-6 sm:p-8">
                <div className="mx-auto max-w-2xl text-center">
                    <div className="inline-flex items-center justify-center h-16 w-16 rounded-3xl bg-default-100 mb-4">
                        <File className="w-8 h-8 text-default-300" />
                    </div>
                    <h3 className="text-2xl font-bold tracking-[-0.03em] text-foreground">
                        No files in the queue yet
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-default-500">
                        Start from the dropzone to build an upload batch. Once files are staged, this
                        area becomes your queue, status board, and retry surface.
                    </p>
                </div>

                <div className="mt-8 grid gap-4 md:grid-cols-3">
                    {[
                        {
                            icon: HardDriveUpload,
                            title: '1. Stage files',
                            description: 'Drop one file or a full batch before you upload anything.',
                        },
                        {
                            icon: CheckCircle2,
                            title: '2. Review the queue',
                            description: 'Confirm file names, sizes, and any failed items before retrying.',
                        },
                        {
                            icon: Sparkles,
                            title: '3. Send to workspace',
                            description: 'Uploaded files move toward recordings, transcript, and AI processing.',
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
