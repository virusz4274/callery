import React, { memo } from 'react';
import { Checkbox } from '@heroui/react';
import type { Recording } from '@/lib/types';
import type { TableSelectionState } from './types';
import { RecordingsTableEmptyState } from './desktop/recordings-table-empty-state';
import { RecordingsTableRow } from './desktop/recordings-table-row';

interface RecordingsTableDesktopProps {
    recordings: Recording[];
    selection: TableSelectionState;
    onOpenDialog: (recording: Recording) => void;
    onDeleteRequest: (recordings: Recording[]) => void;
    onRetryTranscription?: (recording: Recording) => void;
}

export const RecordingsTableDesktop = memo(function RecordingsTableDesktop({
    recordings,
    selection,
    onOpenDialog,
    onDeleteRequest,
    onRetryTranscription,
}: RecordingsTableDesktopProps) {
    return (
        <div className="hidden md:block relative w-full overflow-hidden pb-10">
            <table className="w-full text-sm text-left">
                <thead className="text-xs uppercase tracking-wider text-default-500 font-semibold bg-default-50/50 border-b border-default-200/50">
                    <tr>
                        <th className="h-14 w-14 px-4 align-top py-4">
                            <div className="flex items-center justify-center">
                                <Checkbox
                                    isSelected={selection.isAllSelected}
                                    onChange={selection.toggleSelectAll}
                                    aria-label="Select all"
                                    className="group-data-[selected=true]:border-primary"
                                >
                                    <Checkbox.Control>
                                        <Checkbox.Indicator />
                                    </Checkbox.Control>
                                </Checkbox>
                            </div>
                        </th>
                        <th className="h-14 px-4 align-top py-4">Contact</th>
                        <th className="h-14 px-4 align-top py-4">Recording Details</th>
                        <th className="h-14 px-4 align-top py-4">Date</th>
                        <th className="h-14 px-4 align-top py-4 text-right">Actions</th>
                    </tr>
                </thead>

                <tbody className="divide-y divide-default-100/50">
                    {recordings.length > 0 ? (
                        recordings.map((recording) => (
                            <RecordingsTableRow
                                key={recording.id}
                                recording={recording}
                                selected={selection.isSelected(recording.id)}
                                onToggleSelect={selection.toggleSelect}
                                onOpenDialog={onOpenDialog}
                                onDeleteRequest={onDeleteRequest}
                                onRetryTranscription={onRetryTranscription}
                            />
                        ))
                    ) : (
                        <RecordingsTableEmptyState />
                    )}
                </tbody>
            </table>
        </div>
    );
});
