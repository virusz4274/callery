'use client';

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
        <div className="relative mx-auto max-w-7xl space-y-8">
            <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(circle_at_top_right,rgba(38,132,255,0.14),transparent_34%),radial-gradient(circle_at_top_left,rgba(13,148,136,0.12),transparent_28%)]" />

            <section className="overflow-hidden rounded-[2rem] border border-default-200/80 bg-background/90 shadow-[0_24px_64px_-48px_rgba(15,23,42,0.45)]">
                <div className="grid gap-6 px-5 py-6 md:px-8 md:py-7 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
                    <div className="space-y-3">
                        <Chip variant="soft" color="accent" size="sm">
                            File library
                        </Chip>
                        <div className="flex items-center gap-2">
                            <h1 className="text-3xl font-black tracking-[-0.05em] text-foreground md:text-4xl">
                                File browser
                            </h1>
                        </div>
                        <p className="max-w-2xl text-sm leading-6 text-default-500">
                            Browse your stored files and folders.
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                            <Chip variant="soft" color="default">
                                Current location: {currentLocation}
                            </Chip>
                            <Chip variant="soft" color="success">
                                {items.length} item{items.length === 1 ? '' : 's'} in view
                            </Chip>
                            <Chip variant="soft" color="default">
                                {folderCount} folder{folderCount === 1 ? '' : 's'}
                            </Chip>
                            <Chip variant="soft" color="default">
                                {fileCount} file{fileCount === 1 ? '' : 's'}
                            </Chip>
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row xl:flex-col">
                        <Button
                            variant="secondary"
                            className="w-full rounded-full px-6 font-semibold"
                            onPress={() => router.push('/recordings')}
                        >
                            View recordings
                        </Button>
                        <Button className="w-full rounded-full px-6 font-semibold" onPress={() => router.push('/upload')}>
                            Upload more calls
                            <ArrowRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </section>

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
