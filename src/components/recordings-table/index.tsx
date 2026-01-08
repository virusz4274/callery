
"use client";

import { useToast } from '@/components/toast-provider';
import React, { useState, useTransition, useCallback } from 'react';
import { useTableSelection } from '@/hooks/use-table-selection';
import { useRouter } from 'next/navigation';
import { Button, Card } from '@heroui/react';
import { Trash2, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { RecordingDetailsDialog } from '../recording-details-dialog'; // Update path if needed, assuming direct sibling in components
import { deleteRecordings } from '@/app/actions/delete-recordings';
import { RecordingsTableProps, TableSelectionState } from './types';
import { RecordingsTableDesktop } from './recordings-table-desktop';
import { RecordingsTableMobile } from './recordings-table-mobile';
import { DeleteConfirmationModal } from './delete-confirmation-modal';
import { Recording } from '@/lib/types';

export function RecordingsTable({
    recordings,
    contacts,
    page,
    setPage,
    totalCount,
    itemsPerPage,
    onRecordingsChange
}: RecordingsTableProps) {
    const { toast } = useToast();
    const router = useRouter();

    // Selection state via reusable hook
    const selectionHook = useTableSelection({ items: recordings });

    // Cast hook result to our defined interface if needed, or ensuring it matches
    const selection: TableSelectionState = React.useMemo(() => ({
        selectedIds: selectionHook.selectedIds,
        selectedCount: selectionHook.selectedCount,
        isAllSelected: selectionHook.isAllSelected,
        isSelected: selectionHook.isSelected,
        toggleSelect: selectionHook.toggleSelect,
        toggleSelectAll: selectionHook.toggleSelectAll,
        clearSelection: selectionHook.clearSelection,
        getSelectedItems: selectionHook.getSelectedItems
    }), [selectionHook]);

    const [activeRecording, setActiveRecording] = useState<Recording | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [recordingsToDelete, setRecordingsToDelete] = useState<string[]>([]);
    const [isDeleting, startDeleteTransition] = useTransition();

    const totalPages = Math.ceil(totalCount / itemsPerPage);

    const openDialog = useCallback((recording: Recording) => {
        setActiveRecording(recording);
    }, []);

    const closeDialog = useCallback(() => {
        setActiveRecording(null);
    }, []);

    const handleDeleteRequest = useCallback((recs: Recording[]) => {
        if (recs.length === 0) return;
        const ids = recs.map(r => r.id);
        setRecordingsToDelete(ids);
        setShowDeleteConfirm(true);
    }, []);

    const executeDelete = useCallback(() => {
        startDeleteTransition(async () => {
            try {
                const result = await deleteRecordings(recordingsToDelete);
                if (result.success) {
                    toast({ title: 'Success', description: result.message, status: 'success' });
                    selection.clearSelection();
                    if (onRecordingsChange) {
                        await onRecordingsChange();
                    }
                    router.refresh();
                } else {
                    toast({ title: 'Error', description: result.message, status: 'danger' });
                }
            } catch (error) {
                console.error('Delete error:', error);
                toast({ title: 'Error', description: 'Failed to delete recordings', status: 'danger' });
            }
            setShowDeleteConfirm(false);
            setRecordingsToDelete([]);
        });
    }, [recordingsToDelete, onRecordingsChange, router, toast, selection]);

    return (
        <>
            <div className="space-y-4">
                <Card className="bg-card/70 backdrop-blur-xl border border-default-200/50 shadow-xl transition-all duration-300">
                    {/* Table Controls / Header */}
                    <Card.Header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 border-b border-default-100/50">
                        <div>
                            <h2 className="text-lg font-semibold text-foreground">Recent Recordings</h2>
                            <p className="text-sm text-default-500">
                                {selection.selectedCount > 0
                                    ? `${selection.selectedCount} item(s) selected`
                                    : `Showing ${recordings.length} of ${totalCount} recordings`}
                            </p>
                        </div>

                        {selection.selectedCount > 0 && (
                            <Button
                                variant="danger"
                                size="sm"
                                onPress={() => {
                                    const recs = recordings.filter(r => selection.selectedIds.has(r.id));
                                    handleDeleteRequest(recs);
                                }}
                                isDisabled={isDeleting}
                                className="animate-appearance-in font-medium"
                            >
                                {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                                Delete Selection ({selection.selectedCount})
                            </Button>
                        )}
                    </Card.Header>

                    <Card.Content className="p-0">
                        <RecordingsTableDesktop
                            recordings={recordings}
                            selection={selection}
                            onOpenDialog={openDialog}
                            onDeleteRequest={handleDeleteRequest}
                        />
                        <RecordingsTableMobile
                            recordings={recordings}
                            contacts={contacts}
                            selection={selection}
                            onOpenDialog={openDialog}
                            onDeleteRequest={handleDeleteRequest}
                        />
                    </Card.Content>

                    {totalPages > 1 && (
                        <Card.Footer className="flex items-center justify-between px-6 py-4 border-t border-default-100/50">
                            <span className="text-xs text-default-400 uppercase tracking-widest font-semibold">
                                Page {page} of {totalPages}
                            </span>
                            <div className="flex gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onPress={() => setPage(Math.max(1, page - 1))}
                                    isDisabled={page === 1}
                                    className="bg-default-100/50 backdrop-blur-md"
                                >
                                    <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onPress={() => setPage(Math.min(totalPages, page + 1))}
                                    isDisabled={page === totalPages}
                                    className="bg-default-100/50 backdrop-blur-md"
                                >
                                    Next <ChevronRight className="h-4 w-4 ml-1" />
                                </Button>
                            </div>
                        </Card.Footer>
                    )}
                </Card>
            </div>

            {activeRecording && (
                <RecordingDetailsDialog
                    recording={activeRecording}
                    onOpenChange={(isOpen) => !isOpen && closeDialog()}
                />
            )}

            {showDeleteConfirm && (
                <DeleteConfirmationModal
                    isOpen={showDeleteConfirm}
                    onOpenChange={setShowDeleteConfirm}
                    count={recordingsToDelete.length}
                    onConfirm={executeDelete}
                    isDeleting={isDeleting}
                />
            )}
        </>
    );
}
