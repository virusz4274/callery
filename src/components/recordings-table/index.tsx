'use client';

import React from 'react';
import { Card } from '@heroui/react';
import { RecordingDetailsDialog } from '../recording-details-dialog';
import { DeleteConfirmationModal } from './delete-confirmation-modal';
import { RecordingsTableDesktop } from './recordings-table-desktop';
import { RecordingsTableMobile } from './recordings-table-mobile';
import { RecordingsTableFooter } from './recordings-table-footer';
import { RecordingsTableHeader } from './recordings-table-header';
import { useRecordingsTableController } from './use-recordings-table-controller';
import type { RecordingsTableProps } from './types';

export function RecordingsTable({
    recordings,
    contacts,
    page,
    setPage,
    totalCount,
    itemsPerPage,
    onRecordingsChange,
    onRetryTranscription,
    variant = 'default',
}: RecordingsTableProps) {
    const {
        activeRecording,
        isDeleting,
        isSelectionMode,
        recordingsToDelete,
        selection,
        showDeleteConfirm,
        setShowDeleteConfirm,
        closeDialog,
        executeDelete,
        handleRecordingUpdated,
        handleDeleteRequest,
        handleDeleteSelection,
        openDialog,
        toggleSelectionMode,
    } = useRecordingsTableController({ recordings, onRecordingsChange });

    const totalPages = Math.ceil(totalCount / itemsPerPage);

    return (
        <>
            <div className="space-y-3 md:space-y-4">
                <Card
                    className={`transition-all duration-300 ${
                        variant === 'flat'
                            ? 'bg-transparent border-none shadow-none'
                            : 'rounded-[1.75rem] border border-default-200/80 bg-background/95 shadow-[0_24px_64px_-48px_rgba(15,23,42,0.45)]'
                    }`}
                >
                    <RecordingsTableHeader
                        totalCount={totalCount}
                        displayedCount={recordings.length}
                        selectedCount={selection.selectedCount}
                        isDeleting={isDeleting}
                        isSelectionMode={isSelectionMode}
                        onToggleSelectionMode={toggleSelectionMode}
                        onDeleteSelection={handleDeleteSelection}
                        variant={variant}
                    />

                    <Card.Content className={`p-0 ${variant === 'flat' ? 'mt-2' : ''}`}>
                        <RecordingsTableDesktop
                            recordings={recordings}
                            selection={selection}
                            onOpenDialog={openDialog}
                            onDeleteRequest={handleDeleteRequest}
                            onRetryTranscription={onRetryTranscription}
                        />
                        <RecordingsTableMobile
                            recordings={recordings}
                            contacts={contacts}
                            selection={selection}
                            onOpenDialog={openDialog}
                            onDeleteRequest={handleDeleteRequest}
                            onRetryTranscription={onRetryTranscription}
                            isSelectionMode={isSelectionMode}
                            toggleSelectionMode={toggleSelectionMode}
                        />
                    </Card.Content>

                    <RecordingsTableFooter
                        page={page}
                        totalPages={totalPages}
                        onPageChange={setPage}
                        variant={variant}
                    />
                </Card>
            </div>

            {activeRecording && (
                <RecordingDetailsDialog
                    recording={activeRecording}
                    onOpenChange={(isOpen) => !isOpen && closeDialog()}
                    onRecordingUpdated={handleRecordingUpdated}
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
