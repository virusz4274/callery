import { getRecordingCallerLabel } from '@/lib/recording-label';
import { recordingPreview } from '@/lib/recording-summary';
import { memo } from 'react';
import { Recording, Contact } from '@/lib/types';
import { Button, Dropdown, Checkbox } from '@heroui/react';
import { MoreHorizontal, Play } from 'lucide-react';
import { ClientFormattedDate } from '../client-formatted-date';
import { TableSelectionState, RecordingEmptyState } from './types';
import { RecordingsEmptyContent } from './desktop/recordings-table-empty-state';
import { SummaryPreview } from './summary-preview';
import { useCanDeleteRecording, useTeamPolicy } from '@/hooks/use-team-policy';

// Helper for duration formatting
const formatDurationLocal = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

interface RecordingsTableMobileProps {
    recordings: Recording[];
    contacts: Contact[];
    selection: TableSelectionState;
    onOpenDialog: (recording: Recording) => void;
    onPlayRecording?: (recording: Recording) => void;
    onDeleteRequest: (recordings: Recording[]) => void;
    onRetryTranscription?: (recording: Recording) => void;
    isSelectionMode: boolean;
    toggleSelectionMode: () => void;
    density?: 'comfortable' | 'dense';
    emptyState?: RecordingEmptyState;
}

export const RecordingsTableMobile = memo(function RecordingsTableMobile({
    recordings,
    selection,
    onOpenDialog,
    onPlayRecording,
    onDeleteRequest,
    onRetryTranscription,
    isSelectionMode,
    toggleSelectionMode,
    density = 'comfortable',
    emptyState,
}: RecordingsTableMobileProps) {
    const canDelete = useCanDeleteRecording();
    const team = useTeamPolicy();
    const { isSelected, toggleSelect } = selection;


    return (
        <div className="flex flex-col divide-y divide-border lg:hidden">
            {recordings.length ? recordings.map(rec => {
                const selected = isSelected(rec.id);
                const title = getRecordingCallerLabel(rec);
                return <div key={rec.id} className={`flex items-start gap-2 px-3 py-3 ${selected ? 'bg-accent/10' : ''}`}>
                    {isSelectionMode && <div className="flex size-11 shrink-0 items-center justify-center">
                        <Checkbox aria-label={`Select ${title}`} isSelected={selected} onChange={() => toggleSelect(rec.id)}>
                            <Checkbox.Content className="min-h-11 min-w-11 justify-center">
                                <Checkbox.Control className={selected ? undefined : 'border-muted'}><Checkbox.Indicator /></Checkbox.Control>
                            </Checkbox.Content>
                        </Checkbox>
                    </div>}
                    <div className={`min-w-0 flex-1 ${density === 'comfortable' ? 'py-2' : ''}`}>
                    <Button variant="ghost" type="button" aria-label={isSelectionMode ? `Toggle selection for ${title}` : title}
                        aria-pressed={isSelectionMode ? selected : undefined}
                        onPress={() => {
                            if (isSelectionMode) toggleSelect(rec.id);
                            else onOpenDialog(rec);
                        }}
                        className="min-h-11 h-auto w-full min-w-0 flex-col items-start whitespace-normal text-left">
                        <span className="block w-full break-words text-base font-semibold text-foreground">{title}</span>
                        {rec.uploaderName && <span className="text-sm text-muted">Uploaded by {rec.uploaderName}</span>}
                        {isSelectionMode && <span className="recording-preview mt-1 text-sm leading-5 text-foreground" data-lines={density === 'dense' ? 2 : 3}>{recordingPreview(rec) || 'No conversation preview yet'}</span>}
                    </Button>
                        {!isSelectionMode && <SummaryPreview recording={rec} density={density} />}
                        <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                            <ClientFormattedDate date={rec.recordedAt} formatString="MMM d, yyyy · p" />
                            <span aria-hidden="true">·</span>
                            <span>{formatDurationLocal(rec.duration)}</span>
                        </span>
                    </div>
                    {!isSelectionMode && <div className="flex shrink-0 flex-col items-center">
                        <Button isIconOnly variant="ghost" className="size-11" aria-label={`Play audio for ${title}`} onPress={() => (onPlayRecording || onOpenDialog)(rec)}><Play className="size-4" /></Button>
                        <Dropdown>
                        <Button isIconOnly variant="ghost" className="size-11 shrink-0" aria-label={`Actions for ${title}`}><MoreHorizontal className="size-5" /></Button>
                        <Dropdown.Popover isNonModal><Dropdown.Menu aria-label="Recording actions">
                            <Dropdown.Item id="open" onPress={() => onOpenDialog(rec)}>Open recording</Dropdown.Item>
                            <Dropdown.Item id="select" onPress={() => { toggleSelectionMode(); toggleSelect(rec.id); }}>Select</Dropdown.Item>
                            {(rec.transcriptionStatus === 'failed' || rec.transcriptionStatus === 'pending') && onRetryTranscription && (!team || team.transcriptionMode !== 'off') && <Dropdown.Item id="retry" onPress={() => onRetryTranscription(rec)}>Retry transcription</Dropdown.Item>}
                            {canDelete && <Dropdown.Item id="delete" className="text-danger" onPress={() => onDeleteRequest([rec])}>Delete</Dropdown.Item>}
                        </Dropdown.Menu></Dropdown.Popover>
                    </Dropdown></div>}
                </div>;
            }) : <div className="p-6"><RecordingsEmptyContent {...emptyState} /></div>}
        </div>
    );
});
