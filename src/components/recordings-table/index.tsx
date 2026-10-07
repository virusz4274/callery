'use client';

import { Card } from '@heroui/react';
import { RecordingWorkspace } from '../recording-view/recording-workspace';
import { DeleteConfirmationModal } from './delete-confirmation-modal';
import { RecordingsTableDesktop } from './recordings-table-desktop';
import { RecordingsTableMobile } from './recordings-table-mobile';
import { RecordingsTableFooter } from './recordings-table-footer';
import { RecordingsTableHeader } from './recordings-table-header';
import { useRecordingsTableController } from './use-recordings-table-controller';
import type { RecordingsTableProps } from './types';
import { SummaryExpansionProvider } from './summary-preview';

export function RecordingsTable({
    recordingWorkspace,
    recordings,
    contacts,
    page,
    setPage,
    totalCount,
    itemsPerPage,
    onRecordingsChange,
    onRetryTranscription,
    variant = 'default',
    density = 'comfortable',
    emptyState,
    semanticPagination,
}: RecordingsTableProps) {
    const {
        workspace,
        isDeleting,
        isSelectionMode,
        recordingsToDelete,
        selection,
        showDeleteConfirm,
        setShowDeleteConfirm,
        executeDelete,
        handleDeleteRequest,
        handleDeleteSelection,
        openDialog,
        toggleSelectionMode,
    } = useRecordingsTableController({ recordings, onRecordingsChange, recordingWorkspace });

    const totalPages = Math.ceil(totalCount / itemsPerPage);

    return (
        <>
            <div className="space-y-3 md:space-y-4">
                <Card
                    className={`gap-0 p-0 ${
                        variant === 'flat'
                            ? 'bg-transparent border-none shadow-none'
                            : 'overflow-hidden'
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
                        density={density}
                        isSemantic={Boolean(semanticPagination)}
                    />

                    <Card.Content className={`p-0 ${variant === 'flat' ? 'mt-2' : ''}`}>
                        <SummaryExpansionProvider>
                        <RecordingsTableDesktop
                            recordings={recordings}
                            selection={selection}
                            onOpenDialog={openDialog}
                            onPlayRecording={(recording) => workspace.open(recording, true)}
                            onDeleteRequest={handleDeleteRequest}
                            onRetryTranscription={onRetryTranscription}
                            density={density}
                            emptyState={emptyState}
                        />
                        <RecordingsTableMobile
                            recordings={recordings}
                            contacts={contacts}
                            selection={selection}
                            onOpenDialog={openDialog}
                            onPlayRecording={(recording) => workspace.open(recording, true)}
                            onDeleteRequest={handleDeleteRequest}
                            onRetryTranscription={onRetryTranscription}
                            isSelectionMode={isSelectionMode}
                            toggleSelectionMode={toggleSelectionMode}
                            density={density}
                            emptyState={emptyState}
                        />
                        </SummaryExpansionProvider>
                    </Card.Content>

                    <RecordingsTableFooter
                        page={page}
                        totalPages={totalPages}
                        onPageChange={setPage}
                        variant={variant}
                        semanticPagination={semanticPagination}
                    />
                </Card>
            </div>

            {!recordingWorkspace && <RecordingWorkspace workspace={workspace} onUpdated={onRecordingsChange} />}

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
