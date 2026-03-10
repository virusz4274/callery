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
        <div className="flex-1 min-h-0 overflow-y-auto p-2">
            {isLoading ? (
                <div className="flex justify-center items-center h-full">
                    <Spinner />
                </div>
            ) : filteredFiles.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                    <Search className="h-10 w-10 mb-2 opacity-20" />
                    <p>No files found</p>
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
