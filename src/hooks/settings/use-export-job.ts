import { useEffect, useState } from 'react';
import { getExportStatus, startExport } from '@/app/actions/export';
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

        const checkStatus = async () => {
            const status = await getExportStatus();
            setExportJob(status);
            if ((status?.status === 'completed' || status?.status === 'failed') && interval) {
                clearInterval(interval);
            }
        };

        checkStatus();

        if (exportJob?.status === 'pending' || exportJob?.status === 'processing' || isExportStarting) {
            interval = setInterval(checkStatus, 3000);
        }

        return () => {
            if (interval) {
                clearInterval(interval);
            }
        };
    }, [isExportStarting, exportJob?.status]);

    const handleStartExport = async () => {
        setIsExportStarting(true);
        try {
            const result = await startExport();
            if (result.success) {
                toast({
                    title: 'Export Started',
                    description: 'We are preparing your files. You will receive an email when ready.',
                    status: 'success',
                });
                setExportJob({ id: 'temp', status: 'pending', progress: 0, createdAt: new Date().toISOString() });
            } else {
                toast({ title: 'Export Failed', description: result.message || 'Could not start export.', status: 'danger' });
            }
        } catch {
            toast({ title: 'Error', description: 'Failed to start export.', status: 'danger' });
        } finally {
            setIsExportStarting(false);
        }
    };

    return {
        exportJob,
        isExportStarting,
        handleStartExport,
    };
}
