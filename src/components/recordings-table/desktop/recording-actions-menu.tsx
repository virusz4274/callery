import { getRecordingCallerLabel } from '@/lib/recording-label';
import { Button, Dropdown, Tooltip } from '@heroui/react';
import { FileText, Play, MoreHorizontal, RefreshCcw, Trash2 } from 'lucide-react';
import type { Recording } from '@/lib/types';

type RecordingActionsMenuProps = {
    recording: Recording;
    onOpenDialog: (recording: Recording) => void;
    onPlayRecording?: (recording: Recording) => void;
    onDeleteRequest: (recordings: Recording[]) => void;
    onRetryTranscription?: (recording: Recording) => void;
};

export function RecordingActionsMenu({
    recording,
    onOpenDialog,
    onPlayRecording,
    onDeleteRequest,
    onRetryTranscription,
}: RecordingActionsMenuProps) {
    const canRetry =
        (recording.transcriptionStatus === 'failed' ||
            recording.transcriptionStatus === 'pending' ||
            recording.transcriptionStatus === 'processing') &&
        onRetryTranscription;

    return (
        <>
            <Tooltip>
                <Button
                    isIconOnly
                    size="sm"
                    variant="ghost"
                    className="text-muted hover:text-accent"
                    aria-label={`Play audio for ${getRecordingCallerLabel(recording)}`}
                    onPress={() => (onPlayRecording || onOpenDialog)(recording)}
                >
                    <Play className="h-4 w-4" />
                </Button>
                <Tooltip.Content>Play audio</Tooltip.Content>
            </Tooltip>

            <Dropdown>
                <Button
                    isIconOnly
                    variant="ghost"
                    size="sm"
                    aria-label={`Actions for ${getRecordingCallerLabel(recording)}`}
                    className="h-8 w-8 text-muted hover:text-foreground"
                >
                    <MoreHorizontal className="h-4 w-4" />
                </Button>
                <Dropdown.Popover isNonModal={true}>
                    <Dropdown.Menu aria-label="Recording actions">
                        <Dropdown.Item key="view" textValue="Open recording" onPress={() => onOpenDialog(recording)}>
                            <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4" /> Open recording
                            </div>
                        </Dropdown.Item>
                        {canRetry && (
                            <Dropdown.Item key="retry" textValue="Retry Transcription" onPress={() => onRetryTranscription(recording)}>
                                <div className="flex items-center gap-2">
                                    <RefreshCcw className="h-4 w-4 text-warning" /> Retry Transcription
                                </div>
                            </Dropdown.Item>
                        )}
                        <Dropdown.Item
                            key="delete"
                            className="text-danger"
                            textValue="Delete"
                            onPress={() => onDeleteRequest([recording])}
                        >
                            <div className="flex items-center gap-2">
                                <Trash2 className="h-4 w-4" /> Delete
                            </div>
                        </Dropdown.Item>
                    </Dropdown.Menu>
                </Dropdown.Popover>
            </Dropdown>
        </>
    );
}
