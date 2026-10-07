'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Button, Surface } from '@heroui/react';

export function AdminFeedback({ title, message, onRetry, pending = false }: {
    title: string; message?: string; onRetry?: () => void; pending?: boolean;
}) {
    return <Surface variant="secondary" className="flex flex-wrap items-center justify-between gap-3 border border-danger/30 p-4">
        <div role="alert" className="min-w-0 break-words">
            <p className="font-medium text-foreground">{title}</p>
            {message && <p className="mt-1 text-sm text-muted">{message}</p>}
        </div>
        {onRetry && <Button variant="secondary" className="min-h-11" isPending={pending} onPress={onRetry}>Retry</Button>}
    </Surface>;
}

export function AdminPageRetry({ title, message }: { title: string; message?: string }) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    return <AdminFeedback title={title} message={message} pending={pending} onRetry={() => startTransition(() => router.refresh())} />;
}
