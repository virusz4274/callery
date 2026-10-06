'use client';

import { PageHeader } from '@/components/page-header';
import { useRouter } from 'next/navigation';
import { Button, Chip, Spinner } from '@heroui/react';
import { RecordingDetailsDialog } from '@/components/recording-details-dialog';
import { DeleteConfirmationModal } from '@/components/recordings-table/delete-confirmation-modal';
import type { FileSystemNode } from '@/lib/types';
import { FileBrowserTable } from './file-browser/file-browser-table';
import { useFileBrowser } from './file-browser/use-file-browser';
import { ArrowRight } from 'lucide-react';

type FileBrowserPageProps = {
    rootNode: FileSystemNode;
    onRefresh?: () => void;
};

export function FileBrowserPage({ rootNode, onRefresh }: FileBrowserPageProps) {
    const router = useRouter();
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

    const folderCount = items.filter((item) => item.type === 'folder').length;
    const fileCount = items.filter((item) => item.type === 'file').length;
    const currentLocation = breadcrumbItems[breadcrumbItems.length - 1]?.name || 'Root';

    return (
        <div className="w-full min-w-0 space-y-6">


            <PageHeader
                title="Files"
                description={`Browse your original recordings. Current folder: ${currentLocation}.`}
                meta={<Chip variant="soft" color="default" size="sm">{folderCount} folder{folderCount === 1 ? '' : 's'} · {fileCount} file{fileCount === 1 ? '' : 's'}</Chip>}
                actions={<> <Button variant="secondary" onPress={() => router.push('/recordings')}>View recordings</Button><Button onPress={() => router.push('/upload')}>Upload recordings<ArrowRight className="size-4" /></Button></>}
            />

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

            {isDeleteModalOpen && (
                <DeleteConfirmationModal
                    isOpen={isDeleteModalOpen}
                    onOpenChange={setIsDeleteModalOpen}
                    onConfirm={confirmDelete}
                    isDeleting={isDeleting}
                    count={1}
                />
            )}

            {isLoadingDetails && (
                <div className="fixed inset-0 bg-background/50 backdrop-blur-sm z-[200] flex items-center justify-center">
                    <div className="flex flex-col items-center gap-4 rounded-[1.5rem] border border-default-200 bg-background p-6 shadow-[0_20px_54px_-44px_rgba(15,23,42,0.45)]">
                        <Spinner size="lg" />
                        <p className="text-default-500 font-medium">Loading recording...</p>
                    </div>
                </div>
            )}
        </div>
    );
}
