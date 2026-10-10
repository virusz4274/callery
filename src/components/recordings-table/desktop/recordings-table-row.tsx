import { getRecordingCallerLabel } from '@/lib/recording-label';
import { Avatar, Button, Checkbox, Table } from '@heroui/react';
import type { Recording } from '@/lib/types';
import { ClientFormattedDate } from '@/components/client-formatted-date';
import { formatDuration } from '../format-duration';
import { RecordingActionsMenu } from './recording-actions-menu';
import { SummaryPreview } from '../summary-preview';

type RecordingsTableRowProps = {
    recording: Recording;
    selected: boolean;
    onOpenDialog: (recording: Recording) => void;
    onPlayRecording?: (recording: Recording) => void;
    onDeleteRequest: (recordings: Recording[]) => void;
    onRetryTranscription?: (recording: Recording) => void;
    density?: 'comfortable' | 'dense';
};

export function RecordingsTableRow({ recording, selected, onOpenDialog,
    onDeleteRequest, onPlayRecording, onRetryTranscription, density = 'comfortable' }: RecordingsTableRowProps) {
    const caller = getRecordingCallerLabel(recording);
    const cell = `${density === 'dense' ? 'px-3 py-3' : 'px-4 py-4'} align-top`;
    return <Table.Row key={recording.id} id={recording.id} textValue={caller} className={`group transition-colors ${selected ? 'bg-accent/10' : 'hover:bg-surface-secondary'}`}>
        <Table.Cell className={cell}>
            <div className="flex items-center justify-center"><Checkbox slot="selection" aria-label={`Select ${caller}`}>
                <Checkbox.Content className="min-h-11 min-w-11 justify-center"><Checkbox.Control className={selected ? undefined : 'border-muted'}><Checkbox.Indicator /></Checkbox.Control></Checkbox.Content>
            </Checkbox></div>
        </Table.Cell>
        <Table.Cell className={cell}>
            <div className="flex min-w-0 items-start gap-3">
                <Avatar className="mt-1 size-8 shrink-0" color="default"><Avatar.Fallback>{recording.contactName?.charAt(0) || '#'}</Avatar.Fallback></Avatar>
                <div className="min-w-0 flex-1">
                    <Button variant="ghost" type="button" aria-label={caller} onPress={() => onOpenDialog(recording)} className="min-h-11 h-auto max-w-full flex-col items-start justify-start whitespace-normal text-left">
                        <span className="block break-words text-sm font-semibold leading-5 text-foreground">{caller}</span>
                        {recording.uploaderName && <span className="text-xs text-muted">Uploaded by {recording.uploaderName}</span>}
                        {recording.phoneNumber && recording.phoneNumber !== 'Unknown' && recording.phoneNumber !== caller && <span className="mt-1 block break-all font-mono text-xs leading-5 text-muted">{recording.phoneNumber}</span>}
                    </Button>
                </div>
            </div>
        </Table.Cell>
        <Table.Cell className={cell}>
            <SummaryPreview recording={recording} density={density} />
            <p className="mt-1 text-xs leading-5 tabular-nums text-muted">{formatDuration(recording.duration)}</p>
        </Table.Cell>
        <Table.Cell className={cell}>
            <p className="text-sm leading-5 text-foreground"><ClientFormattedDate date={recording.recordedAt} formatString="MMM d, yyyy" /></p>
            <p className="mt-1 text-xs leading-5 text-muted"><ClientFormattedDate date={recording.recordedAt} formatString="h:mm a" /></p>
        </Table.Cell>
        <Table.Cell className={`${cell} text-right`}><div className="-mt-1 flex items-center justify-end gap-1">
            <RecordingActionsMenu recording={recording} onOpenDialog={onOpenDialog} onPlayRecording={onPlayRecording} onDeleteRequest={onDeleteRequest} onRetryTranscription={onRetryTranscription} />
        </div></Table.Cell>
    </Table.Row>;
}
