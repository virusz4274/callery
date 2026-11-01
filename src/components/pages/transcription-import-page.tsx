'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Spinner } from '@heroui/react';
import { UploadPage } from '@/components/pages/upload-page';
import { useUser } from '@/lib/auth/client';
import { authFetchJson } from '@/lib/api-client';
import { buildLoginRedirectHref } from '@/lib/auth-redirect';

export function TranscriptionImportPage({ initialImportId }: { initialImportId?: string }) {
    const { user, isUserLoading } = useUser();
    const router = useRouter();
    const [importId, setImportId] = useState(initialImportId);
    const [error, setError] = useState<string>();
    const creation = useRef<Promise<{ importId: string }> | null>(null);

    useEffect(() => {
        if (isUserLoading) return;
        if (!user) {
            router.replace(buildLoginRedirectHref('/transcription/import'));
            return;
        }
        if (importId) return;
        let active = true;
        creation.current ??= authFetchJson<{ importId: string }>('/api/transcription/imports', { method: 'POST' });
        creation.current.then(result => {
            if (!active) return;
            if (!result.importId) throw new Error('Could not prepare your import.');
            setImportId(result.importId);
            router.replace(`/transcription/import?importId=${encodeURIComponent(result.importId)}`);
        }).catch(cause => {
            if (active) setError(cause instanceof Error ? cause.message : 'Could not prepare your import.');
        });
        return () => { active = false; };
    }, [importId, isUserLoading, router, user]);

    if (error) return (
        <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
                <Alert.Title>Unable to prepare bulk import</Alert.Title>
                <Alert.Description>{error}</Alert.Description>
                <Button variant="secondary" className="mt-3" onPress={() => window.location.reload()}>Try again</Button>
            </Alert.Content>
        </Alert>
    );
    if (!user || !importId) return <div className="flex justify-center p-8"><Spinner aria-label="Preparing bulk import" /></div>;
    return <UploadPage bulkImportId={importId} />;
}
