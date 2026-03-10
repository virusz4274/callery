'use client';

import { File } from 'lucide-react';

export function UploadEmptyState() {
    return (
        <div className="h-full flex items-center justify-center min-h-[300px] border-2 border-dashed border-default-100 rounded-3xl bg-default-50/30 text-default-400">
            <div className="text-center p-6">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-default-100 mb-4">
                    <File className="w-8 h-8 text-default-300" />
                </div>
                <p className="text-lg font-medium">No files selected</p>
                <p className="text-sm text-default-400">Files you add will appear here</p>
            </div>
        </div>
    );
}
