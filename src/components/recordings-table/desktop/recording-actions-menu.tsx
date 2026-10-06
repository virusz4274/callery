import { Button, Dropdown } from '@heroui/react';
import { FileText, MoreHorizontal, Play, RefreshCcw, Trash2 } from 'lucide-react';
import type { Recording } from '@/lib/types';

type RecordingActionsMenuProps = {
    recording: Recording;
    onOpenDialog: (recording: Recording) => void;
    onDeleteRequest: (recordings: Recording[]) => void;
    onRetryTranscription?: (recording: Recording) => void;
};

export function RecordingActionsMenu({
    recording,
    onOpenDialog,
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
            <Button
                isIconOnly
                size="sm"
                variant="ghost"
                className="text-muted hover:text-accent"
                aria-label={`Open ${recording.standardizedDisplayName || recording.fileName}`}
                onPress={() => onOpenDialog(recording)}
            >
                <Play className="h-4 w-4 fill-current" />
            </Button>

            <Dropdown>
                <Button
                    isIconOnly
                    variant="ghost"
                    size="sm"
                    aria-label="Actions"
                    className="h-8 w-8 text-default-400 hover:text-foreground"
                >
                    <MoreHorizontal className="h-4 w-4" />
                </Button>
                <Dropdown.Popover isNonModal={true}>
                    <Dropdown.Menu aria-label="Recording actions">
                        <Dropdown.Item key="play" textValue="Play Audio" onPress={() => onOpenDialog(recording)}>
                            <div className="flex items-center gap-2">
                                <Play className="h-4 w-4 text-primary" /> Play Audio
                            </div>
                        </Dropdown.Item>
                        <Dropdown.Item key="view" textValue="View Transcript" onPress={() => onOpenDialog(recording)}>
                            <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-secondary" /> View Transcript
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
