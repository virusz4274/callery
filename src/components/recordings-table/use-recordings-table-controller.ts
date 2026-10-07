'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { useRecordingWorkspace } from '@/hooks/use-recording-workspace';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/toast-provider';
import { useTableSelection } from '@/hooks/use-table-selection';
import { deleteRecordings } from '@/app/actions/delete-recordings';
import type { Recording } from '@/lib/types';
import type { TableSelectionState } from './types';

type UseRecordingsTableControllerOptions = {
    recordingWorkspace?: ReturnType<typeof useRecordingWorkspace>;
    recordings: Recording[];
    onRecordingsChange?: () => Promise<void> | void;
};

export function useRecordingsTableController({
    recordingWorkspace,
    recordings,
    onRecordingsChange,
}: UseRecordingsTableControllerOptions) {
    const router = useRouter();
    const { toast } = useToast();

    const selectionHook = useTableSelection({ items: recordings });

    const selection: TableSelectionState = useMemo(
        () => ({
            selectedIds: selectionHook.selectedIds,
            selectedCount: selectionHook.selectedCount,
            isAllSelected: selectionHook.isAllSelected,
            isSelected: selectionHook.isSelected,
            toggleSelect: selectionHook.toggleSelect,
            toggleSelectAll: selectionHook.toggleSelectAll,
            clearSelection: selectionHook.clearSelection,
            getSelectedItems: selectionHook.getSelectedItems,
        }),
        [selectionHook]
    );

    const internalWorkspace = useRecordingWorkspace(recordings, !recordingWorkspace);
    const workspace = recordingWorkspace || internalWorkspace;
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [recordingsToDelete, setRecordingsToDelete] = useState<string[]>([]);
    const [isDeleting, startDeleteTransition] = useTransition();
    const [isSelectionMode, setIsSelectionMode] = useState(false);

    const handleDeleteRequest = useCallback((items: Recording[]) => {
        if (items.length === 0) {
            return;
        }

        setRecordingsToDelete(items.map((item) => item.id));
        setShowDeleteConfirm(true);
    }, []);

    const handleDeleteSelection = useCallback(() => {
        const selected = recordings.filter((recording) => selection.selectedIds.has(recording.id));
        handleDeleteRequest(selected);
    }, [handleDeleteRequest, recordings, selection.selectedIds]);

    const executeDelete = useCallback(() => {
        startDeleteTransition(async () => {
            try {
                const result = await deleteRecordings(recordingsToDelete);
                if (!result.success) {
                    toast({ title: 'Error', description: result.message, status: 'danger' });
                    return;
                }

                toast({ title: 'Success', description: result.message, status: 'success' });
                selection.clearSelection();
                await onRecordingsChange?.();
                router.refresh();
            } catch (error) {
                console.error('Delete error:', error);
                toast({ title: 'Error', description: 'Failed to delete recordings', status: 'danger' });
            } finally {
                setShowDeleteConfirm(false);
                setRecordingsToDelete([]);
            }
        });
    }, [onRecordingsChange, recordingsToDelete, router, selection, toast]);

    const toggleSelectionMode = useCallback(() => {
        if (isSelectionMode) selection.clearSelection();
        setIsSelectionMode(!isSelectionMode);
    }, [isSelectionMode, selection]);

    return {
        workspace,
        isDeleting,
        isSelectionMode,
        recordingsToDelete,
        selection,
        showDeleteConfirm,
        setShowDeleteConfirm,
        openDialog: workspace.open,
        executeDelete,
        handleDeleteRequest,
        handleDeleteSelection,
        toggleSelectionMode,
    };
}
