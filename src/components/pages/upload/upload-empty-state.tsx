'use client';

import { Card } from '@heroui/react';
import { FileAudio, CheckCircle2, UploadCloud } from 'lucide-react';

const steps = [
    { icon: FileAudio, title: 'Add your audio', description: 'Choose a few files or drop in a whole batch.' },
    { icon: CheckCircle2, title: 'Review the queue', description: 'Check file details and flagged duplicates.' },
    { icon: UploadCloud, title: 'Upload when ready', description: 'Follow each recording as it joins your archive.' },
];

export function UploadEmptyState() {
    return (
        <Card className="gap-0 rounded-xl border border-border bg-surface p-0 shadow-none">
            <Card.Header className="border-b border-border px-6 py-4">
                <h2 className="text-base font-semibold">Upload queue</h2>
            </Card.Header>
            <Card.Content className="p-6">
                <div className="flex flex-col items-center py-5 text-center">
                    <FileAudio className="mb-3 size-8 text-muted" aria-hidden="true" />
                    <h3 className="text-base font-semibold">No files added yet</h3>
                    <p className="mt-2 max-w-xs text-sm leading-6 text-muted">Your selected recordings will appear here before you upload.</p>
                </div>
                <ol className="mt-6 space-y-5 border-t border-border pt-6">
                    {steps.map(({ icon: Icon, title, description }, index) => (
                        <li key={title} className="flex items-start gap-3">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-secondary text-xs font-semibold text-muted">{index + 1}</span>
                            <div className="min-w-0">
                                <p className="flex items-center gap-2 text-sm font-medium"><Icon className="size-4 text-muted" aria-hidden="true" />{title}</p>
                                <p className="mt-1 text-sm leading-5 text-muted">{description}</p>
                            </div>
                        </li>
                    ))}
                </ol>
            </Card.Content>
        </Card>
    );
}
