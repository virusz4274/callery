'use client';

import { PageHeader } from '@/components/page-header';
import { useRouter } from 'next/navigation';
import { Button, Chip, Spinner } from '@heroui/react';
import { RecordingWorkspace } from '@/components/recording-view/recording-workspace';
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
        isUserLoading,
        items,
        workspace,
        user,
        setIsDeleteModalOpen,
        setPath,
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

    return (
        <div className="w-full min-w-0 space-y-6">


            <PageHeader
                title="Files"

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

            <RecordingWorkspace workspace={workspace} />

            {isDeleteModalOpen && (
                <DeleteConfirmationModal
                    isOpen={isDeleteModalOpen}
                    onOpenChange={setIsDeleteModalOpen}
                    onConfirm={confirmDelete}
                    isDeleting={isDeleting}
                    count={1}
                />
            )}


        </div>
    );
}
