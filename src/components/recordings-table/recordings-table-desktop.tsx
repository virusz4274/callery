import { memo } from 'react';
import { Checkbox, Table } from '@heroui/react';
import type { Recording } from '@/lib/types';
import type { TableSelectionState, RecordingEmptyState } from './types';
import { RecordingsEmptyContent } from './desktop/recordings-table-empty-state';
import { RecordingsTableRow } from './desktop/recordings-table-row';

interface RecordingsTableDesktopProps {
    recordings: Recording[];
    selection: TableSelectionState;
    onOpenDialog: (recording: Recording) => void;
    onPlayRecording?: (recording: Recording) => void;
    onDeleteRequest: (recordings: Recording[]) => void;
    onRetryTranscription?: (recording: Recording) => void;
    density?: 'comfortable' | 'dense';
    emptyState?: RecordingEmptyState;
}

export const RecordingsTableDesktop = memo(function RecordingsTableDesktop({
    recordings,
    selection,
    onOpenDialog,
    onPlayRecording,
    onDeleteRequest,
    onRetryTranscription,
    density = 'comfortable',
    emptyState,
}: RecordingsTableDesktopProps) {
    return (
        <div className="relative hidden w-full overflow-x-auto lg:block">
            <Table>
            <Table.Content aria-label="Recordings" className="w-full table-fixed text-sm text-left"
                selectionMode="multiple" selectionBehavior="toggle" selectedKeys={selection.selectedIds}
                onSelectionChange={keys => {
                    // Keep selection on other result pages while HeroUI manages this page.
                    for (const recording of recordings) {
                        const next = keys === 'all' || keys.has(recording.id);
                        if (next !== selection.isSelected(recording.id)) selection.toggleSelect(recording.id);
                    }
                }}>
                <Table.Header>
                        <Table.Column id="selection" aria-label="Selection" className={`${density === 'dense' ? 'w-[68px] px-3' : 'w-[76px] px-4'} h-12 align-middle`}>
                            <div className="flex items-center justify-center">
                                <Checkbox
                                    slot="selection"
                                    aria-label="Select all"
                                    className="group-data-[selected=true]:border-primary"
                                >
                                    <Checkbox.Content className="min-h-11 min-w-11 justify-center">
                                        <Checkbox.Control className={selection.isAllSelected ? undefined : 'border-muted'}>
                                            <Checkbox.Indicator />
                                        </Checkbox.Control>
                                    </Checkbox.Content>
                                </Checkbox>
                            </div>
                        </Table.Column>
                        <Table.Column id="caller" isRowHeader className={`${density === 'dense' ? 'px-3' : 'px-4'} h-12 w-[24%]`}>Caller</Table.Column>
                        <Table.Column id="conversation" className={`${density === 'dense' ? 'px-3' : 'px-4'} h-12`}>Conversation</Table.Column>
                        <Table.Column id="date" className={`${density === 'dense' ? 'px-3' : 'px-4'} h-12 w-[156px]`}>Date</Table.Column>
                        <Table.Column id="actions" className={`${density === 'dense' ? 'px-3' : 'px-4'} h-12 w-[100px] text-right`}>Actions</Table.Column>
                </Table.Header>

                <Table.Body items={recordings} dependencies={[density, selection.selectedIds]}
                    renderEmptyState={() => <div className="px-6 py-12"><RecordingsEmptyContent {...emptyState} /></div>}>
                    {recording => RecordingsTableRow({ recording,
                        selected: selection.isSelected(recording.id),
                        onOpenDialog, onPlayRecording, onDeleteRequest, onRetryTranscription, density,
                    })}
                </Table.Body>
            </Table.Content>
            </Table>
        </div>
    );
});
