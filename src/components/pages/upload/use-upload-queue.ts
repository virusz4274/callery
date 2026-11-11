import { useState } from 'react';
import { useBrowserUploads } from '@/components/uploads/browser-upload-provider';
import { isSupportedUploadFile, UPLOAD_AUDIO_FORMAT_LABELS } from '@/lib/upload-audio-support';
import { uploadIsActive } from '@/lib/browser-uploads-contract';

type ToastFn = (params: { title: string; description?: string; status: 'success' | 'danger' | 'warning' }) => void;

export function useUploadQueue(toast: ToastFn, options: { bulkImportId?: string } = {}) {
    const { manager, items, ready, recoveryAvailable } = useBrowserUploads();
    const [isDragging, setIsDragging] = useState(false);
    const uploadItems = items.filter(item => item.bulkImportId === options.bulkImportId);
    return {
        uploadItems, ready, recoveryAvailable, isDragging, setIsDragging,
        isUploading: uploadItems.some(item => uploadIsActive(item.status)),
        addFiles: (files: File[]) => {
            const supported = files.filter(isSupportedUploadFile);
            if (supported.length !== files.length) toast({ title: 'Unsupported files skipped', description: `Choose ${UPLOAD_AUDIO_FORMAT_LABELS.join(', ')} files.`, status: 'warning' });
            manager.add(supported, options.bulkImportId);
        },
        removeFile: (id: string) => { void manager.remove(id); },
        cancelFile: (id: string) => { void manager.cancel(id); },
        pauseFile: (id: string) => manager.pause(id),
        resumeFile: (id: string) => manager.start([id]),
        reselectFile: (id: string, file: File) => manager.reselect(id, file),
        clearAll: () => { void Promise.all(uploadItems.map(item => manager.remove(item.id))); },
        handleUpload: () => manager.start(uploadItems.map(item => item.id)),
    };
}
