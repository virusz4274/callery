'use client';

import React from 'react';
import { Spinner } from '@heroui/react';
import { RecordingDetailsDialog } from '@/components/recording-details-dialog';
import { DeleteConfirmationModal } from '@/components/recordings-table/delete-confirmation-modal';
import type { FileSystemNode } from '@/lib/types';
import { FileBrowserTable } from './file-browser/file-browser-table';
import { useFileBrowser } from './file-browser/use-file-browser';

type FileBrowserPageProps = {
    rootNode: FileSystemNode;
    onRefresh?: () => void;
};

export function FileBrowserPage({ rootNode, onRefresh }: FileBrowserPageProps) {
    const {
        breadcrumbItems,
        isDeleteModalOpen,
        isDeleting,
        isLoadingDetails,
        isUserLoading,
        items,
        selectedRecording,
        user,
        setIsDeleteModalOpen,
        setPath,
        setSelectedRecording,
        confirmDelete,
        handleDeleteClick,
        handleNodeClick,
    } = useFileBrowser({ rootNode, onRefresh });

    if (isUserLoading || !user) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <Spinner size="lg" />
            </div>
        );
    }

    return (
        <div className="relative space-y-8">
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
                <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-primary/10 blur-3xl opacity-40 animate-pulse" />
                <div className="absolute bottom-[-10%] left-[-5%] w-[400px] h-[400px] rounded-full bg-secondary/10 blur-3xl opacity-40" />
            </div>

            <div className="flex flex-col gap-2">
                <h2 className="text-4xl font-bold tracking-tight text-foreground bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
                    File Browser
                </h2>
                <p className="text-default-500 text-lg">Explore and manage your recordings</p>
            </div>

            <FileBrowserTable
                items={items}
                breadcrumbItems={breadcrumbItems}
                onBreadcrumbClick={setPath}
                onNodeClick={handleNodeClick}
                onDeleteClick={handleDeleteClick}
            />

            {selectedRecording && (
                <RecordingDetailsDialog
                    recording={selectedRecording}
                    onOpenChange={(open) => {
                        if (!open) {
                            setSelectedRecording(null);
                        }
                    }}
                />
            )}

            <DeleteConfirmationModal
                isOpen={isDeleteModalOpen}
                onOpenChange={setIsDeleteModalOpen}
                onConfirm={confirmDelete}
                isDeleting={isDeleting}
                count={1}
            />

            {isLoadingDetails && (
                <div className="fixed inset-0 bg-background/50 backdrop-blur-sm z-[200] flex items-center justify-center">
                    <div className="flex flex-col items-center gap-4 p-6 bg-card rounded-xl shadow-xl border border-default-200">
                        <Spinner size="lg" />
                        <p className="text-default-500 font-medium">Loading recording...</p>
                    </div>
                </div>
            )}
        </div>
    );
}
