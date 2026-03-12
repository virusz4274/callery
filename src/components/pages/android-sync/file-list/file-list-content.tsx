import React from 'react';
import { Spinner } from '@heroui/react';
import { Search } from 'lucide-react';
import type { SyncableFile } from '../types';
import { FileItem } from '../FileItem';

type FileListContentProps = {
    isLoading: boolean;
    filteredFiles: SyncableFile[];
    paginatedFiles: SyncableFile[];
    onToggleFileSelection: (fingerprint: string) => void;
};

export function FileListContent({
    isLoading,
    filteredFiles,
    paginatedFiles,
    onToggleFileSelection,
}: FileListContentProps) {
    return (
        <div className="flex-1 min-h-0 overflow-y-auto p-3">
            {isLoading ? (
                <div className="flex justify-center items-center h-full">
                    <Spinner />
                </div>
            ) : filteredFiles.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                    <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-[1.25rem] bg-default-100 text-default-300">
                        <Search className="h-7 w-7" />
                    </div>
                    <p className="font-semibold text-foreground">No files found</p>
                    <p className="mt-1 text-sm text-default-500">Try a different search term or switch tabs.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {paginatedFiles.map((file) => (
                        <FileItem key={file.fingerprint} file={file} onToggle={onToggleFileSelection} />
                    ))}
                </div>
            )}
        </div>
    );
}
