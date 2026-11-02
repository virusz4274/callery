import { useEffect, useState } from 'react';
import { getExportStatus, retryExport, startExport } from '@/app/actions/export';
import type { ExportJobResponse } from '@/lib/db/types';

type ToastFn = (params: {
    title: string;
    description?: string;
    status: 'success' | 'danger';
}) => void;

export function useExportJob(toast: ToastFn) {
    const [exportJob, setExportJob] = useState<ExportJobResponse | null>(null);
    const [isExportStarting, setIsExportStarting] = useState(false);

    useEffect(() => {
        let interval: ReturnType<typeof setInterval> | undefined;
        let active = true;

        const checkStatus = async () => {
            try {
                const status = await getExportStatus();
                if (!active) return;
                setExportJob(status);
                if ((status?.status === 'completed' || status?.status === 'failed') && interval) clearInterval(interval);
            } catch { /* Keep the last known state and retry on the next poll. */ }
        };

        checkStatus();

        if (exportJob?.status === 'pending' || exportJob?.status === 'processing' || isExportStarting) {
            interval = setInterval(checkStatus, 3000);
        }

        return () => {
            active = false;
            if (interval) {
                clearInterval(interval);
            }
        };
    }, [isExportStarting, exportJob?.status]);

    const handleStartExport = async () => {
        if (isExportStarting) return;
        setIsExportStarting(true);
        try {
            const result = await startExport();
            if (result.success) {
                toast({
                    title: 'Export Queued',
                    description: 'We will email you when it is ready.',
                    status: 'success',
                });
                setExportJob({ id: result.jobId, status: 'pending', progress: 0, parts: [], createdAt: new Date().toISOString() });
            } else {
                toast({ title: 'Export Failed', description: result.message || 'Could not start export.', status: 'danger' });
            }
        } catch {
            toast({ title: 'Error', description: 'Failed to start export.', status: 'danger' });
        } finally {
            setIsExportStarting(false);
        }
    };

    const handleRetryExport = async () => {
        if (!exportJob || isExportStarting) return;
        setIsExportStarting(true);
        try {
            const result = await retryExport(exportJob.id);
            if (result.success) {
                toast({ title: 'Export Retry Queued', description: 'Your existing archive will resume from its saved progress.', status: 'success' });
                setExportJob({ ...exportJob, status: 'pending', error: undefined, retryAvailable: false, retryUnavailableReason: undefined });
            } else {
                toast({ title: 'Export Retry Unavailable', description: result.message, status: 'danger' });
                const current = await getExportStatus();
                setExportJob(current);
            }
        } catch {
            toast({ title: 'Error', description: 'Failed to queue the export retry.', status: 'danger' });
        } finally {
            setIsExportStarting(false);
        }
    };

    return {
        exportJob,
        isExportStarting,
        handleStartExport,
        handleRetryExport,
    };
}
