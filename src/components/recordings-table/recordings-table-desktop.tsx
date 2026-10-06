import { memo } from 'react';
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
    density?: 'comfortable' | 'dense';
}

export const RecordingsTableDesktop = memo(function RecordingsTableDesktop({
    recordings,
    selection,
    onOpenDialog,
    onDeleteRequest,
    onRetryTranscription,
    density = 'comfortable',
}: RecordingsTableDesktopProps) {
    return (
        <div className="relative hidden w-full overflow-x-auto md:block">
            <table className="w-full text-sm text-left">
                <thead className="border-b border-border bg-surface-secondary text-xs font-medium text-muted">
                    <tr>
                        <th className={`${density === 'dense' ? 'h-11 py-3' : 'h-14 py-4'} w-14 px-4 align-top`}>
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
                        <th className={`${density === 'dense' ? 'h-11 py-3' : 'h-14 py-4'} px-4 align-top`}>Contact</th>
                        <th className={`${density === 'dense' ? 'h-11 py-3' : 'h-14 py-4'} px-4 align-top`}>Recording Details</th>
                        <th className={`${density === 'dense' ? 'h-11 py-3' : 'h-14 py-4'} px-4 align-top`}>Date</th>
                        <th className={`${density === 'dense' ? 'h-11 py-3' : 'h-14 py-4'} px-4 align-top text-right`}>Actions</th>
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
                                density={density}
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
