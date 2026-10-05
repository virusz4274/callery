import { Avatar, Checkbox, Chip } from '@heroui/react';
import type { Recording } from '@/lib/types';
import { ClientFormattedDate } from '@/components/client-formatted-date';
import { ExpandableSummary } from '@/components/expandable-summary';
import { formatDuration } from '../format-duration';
import { RecordingActionsMenu } from './recording-actions-menu';
import { RecordingProviderBadge } from './recording-provider-badge';

type RecordingsTableRowProps = {
    recording: Recording;
    selected: boolean;
    onToggleSelect: (id: string) => void;
    onOpenDialog: (recording: Recording) => void;
    onDeleteRequest: (recordings: Recording[]) => void;
    onRetryTranscription?: (recording: Recording) => void;
    density?: 'comfortable' | 'dense';
};

export function RecordingsTableRow({
    recording,
    selected,
    onToggleSelect,
    onOpenDialog,
    onDeleteRequest,
    onRetryTranscription,
    density = 'comfortable',
}: RecordingsTableRowProps) {
    return (
        <tr
            className={`group transition-all duration-200 ${
                selected ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-default-100/50'
            }`}
        >
            <td className={`${density === 'dense' ? 'px-3 py-2.5' : 'p-4'} align-top`}>
                <div className="flex items-center justify-center relative h-5 w-5">
                    <div
                        className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${
                            selected ? 'opacity-100' : 'opacity-40 group-hover:opacity-100'
                        }`}
                    >
                        <Checkbox
                            isSelected={selected}
                            onChange={() => onToggleSelect(recording.id)}
                            aria-label="Select row"
                        >
                            <Checkbox.Control>
                                <Checkbox.Indicator />
                            </Checkbox.Control>
                        </Checkbox>
                    </div>
                </div>
            </td>

            <td className={`${density === 'dense' ? 'px-3 py-2.5' : 'p-4'} align-top`}>
                <div className={`flex items-center ${density === 'dense' ? 'gap-3' : 'gap-4'}`}>
                    <Avatar
                        className={`${density === 'dense' ? 'h-9 w-9' : 'h-10 w-10'} transition-transform group-hover:scale-105 ring-2 ${
                            selected ? 'ring-primary' : 'ring-transparent group-hover:ring-default-200'
                        }`}
                        color={selected ? 'success' : 'default'}
                    >
                        <Avatar.Fallback>{recording.contactName ? recording.contactName.charAt(0) : '#'}</Avatar.Fallback>
                    </Avatar>
                    <div>
                        <div className={`font-semibold ${selected ? 'text-primary' : 'text-foreground'}`}>
                            {recording.contactName || 'Unknown Caller'}
                        </div>
                        <div className="text-xs text-default-500 font-mono">{recording.phoneNumber}</div>
                    </div>
                </div>
            </td>

            <td className={`${density === 'dense' ? 'px-3 py-2.5' : 'p-4'} align-top`}>
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                        <Chip variant="soft" color="default" size="sm">
                            {formatDuration(recording.duration)}
                        </Chip>
                    </div>
                    <div className="opacity-80 group-hover:opacity-100 transition-opacity max-w-[200px] lg:max-w-xs text-wrap">
                        <ExpandableSummary
                            text={
                                recording.summary ||
                                (recording.fullTranscript && recording.fullTranscript[0]?.text) ||
                                'No transcript available...'
                            }
                            compactMaxLength={density === 'dense' ? 40 : 60}
                            className="text-default-500"
                        />
                    </div>
                    <div className="flex gap-1 mt-1">
                        <RecordingProviderBadge recording={recording} />
                    </div>
                </div>
            </td>

            <td className={`${density === 'dense' ? 'px-3 py-2.5' : 'p-4'} align-top`}>
                <div className="text-sm text-default-600">
                    <ClientFormattedDate date={recording.recordedAt} formatString="MMM d, yyyy" />
                </div>
                <div className="text-xs text-default-400">
                    <ClientFormattedDate date={recording.recordedAt} formatString="h:mm a" />
                </div>
            </td>

            <td className={`${density === 'dense' ? 'px-3 py-2.5' : 'p-4'} align-top text-right`}>
                <div className="relative flex justify-end items-center gap-2">
                    <RecordingActionsMenu
                        recording={recording}
                        onOpenDialog={onOpenDialog}
                        onDeleteRequest={onDeleteRequest}
                        onRetryTranscription={onRetryTranscription}
                    />
                </div>
            </td>
        </tr>
    );
}
