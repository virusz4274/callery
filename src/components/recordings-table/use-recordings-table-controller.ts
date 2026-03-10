'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/toast-provider';
import { useTableSelection } from '@/hooks/use-table-selection';
import { deleteRecordings } from '@/app/actions/delete-recordings';
import type { Recording } from '@/lib/types';
import type { TableSelectionState } from './types';

type UseRecordingsTableControllerOptions = {
    recordings: Recording[];
    onRecordingsChange?: () => Promise<void> | void;
};

export function useRecordingsTableController({
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

    const [activeRecording, setActiveRecording] = useState<Recording | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [recordingsToDelete, setRecordingsToDelete] = useState<string[]>([]);
    const [isDeleting, startDeleteTransition] = useTransition();
    const [isSelectionMode, setIsSelectionMode] = useState(false);

    const openDialog = useCallback((recording: Recording) => {
        setActiveRecording(recording);
    }, []);

    const closeDialog = useCallback(() => {
        setActiveRecording(null);
    }, []);

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
        setIsSelectionMode((prev) => {
            const next = !prev;
            if (!next) {
                selection.clearSelection();
            }
            return next;
        });
    }, [selection]);

    return {
        activeRecording,
        isDeleting,
        isSelectionMode,
        recordingsToDelete,
        selection,
        showDeleteConfirm,
        setShowDeleteConfirm,
        closeDialog,
        executeDelete,
        handleDeleteRequest,
        handleDeleteSelection,
        openDialog,
        toggleSelectionMode,
    };
}
