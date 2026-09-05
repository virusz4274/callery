import { memo } from 'react';
import { Recording, Contact } from '@/lib/types';
import Link from 'next/link';
import { Avatar, Button, Chip, Dropdown, Checkbox } from '@heroui/react';
import { MoreHorizontal, FileText, RefreshCcw, Play } from 'lucide-react';
import { ClientFormattedDate } from '../client-formatted-date';
import { ExpandableSummary } from '../expandable-summary';
import { TableSelectionState } from './types';

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
    onDeleteRequest: (recordings: Recording[]) => void;
    onRetryTranscription?: (recording: Recording) => void;
    isSelectionMode: boolean;
    toggleSelectionMode: () => void;
    density?: 'comfortable' | 'dense';
}

export const RecordingsTableMobile = memo(function RecordingsTableMobile({
    recordings,
    selection,
    onOpenDialog,
    onDeleteRequest,
    onRetryTranscription,
    isSelectionMode,
    toggleSelectionMode,
    density = 'comfortable',
}: RecordingsTableMobileProps) {
    const { isSelected, toggleSelect } = selection;

    return (
        <div className="md:hidden flex flex-col divide-y divide-default-100/50 pb-6">
            {recordings.length > 0 ? (
                recordings.map((rec) => {
                    const selected = isSelected(rec.id);

                    return (
                        <div
                            key={rec.id}
                            className={`${density === 'dense' ? 'p-2' : 'p-3'} transition-colors ${selected ? 'bg-primary/5' : ''}`}
                        >
                            <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="relative">
                                        {/* Avatar or Checkbox based on selection mode */}
                                        {isSelectionMode ? (
                                            <div className="h-9 w-9 flex items-center justify-center">
                                                <Checkbox
                                                    isSelected={selected}
                                                    onChange={() => toggleSelect(rec.id)}
                                                    className="m-0"
                                                    aria-label="Select row"
                                                >
                                                    <Checkbox.Control>
                                                        <Checkbox.Indicator />
                                                    </Checkbox.Control>
                                                </Checkbox>
                                            </div>
                                        ) : (
                                            <Avatar
                                                className={`h-9 w-9 ring-2 ${selected ? 'ring-primary' : 'ring-transparent'}`}
                                                color={selected ? "success" : "default"}
                                                onClick={() => {
                                                    // Long press logic or just toggle selection mode?
                                                    // For now, let's keep it simple: Click avatar to enter selection mode
                                                    toggleSelectionMode();
                                                    if (!selected) toggleSelect(rec.id);
                                                }}
                                            >
                                                <Avatar.Fallback>{rec.contactName ? rec.contactName.charAt(0) : '#'}</Avatar.Fallback>
                                            </Avatar>
                                        )}

                                        {!isSelectionMode && selected && (
                                            <div className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground rounded-full p-0.5 border-2 border-background">
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex flex-col min-w-0" onClick={() => isSelectionMode ? toggleSelect(rec.id) : onOpenDialog(rec)}>
                                        <div className="font-semibold text-sm text-foreground truncate">
                                            {rec.contactName || 'Unknown Caller'}
                                        </div>
                                        <div className="flex items-center gap-1.5 text-xs text-default-500">
                                            <span className="font-mono text-[11px]">{rec.phoneNumber}</span>
                                            <span>•</span>
                                            <ClientFormattedDate date={rec.recordedAt} formatString="MMM d" />
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center">
                                    {!isSelectionMode && (
                                        <Dropdown>
                                            <Button
                                                isIconOnly
                                                variant="ghost"
                                                size="sm"
                                                aria-label="Actions"
                                                className="-mr-1 h-8 w-8 text-default-400 hover:text-foreground"
                                            >
                                                <MoreHorizontal className="h-5 w-5" />
                                            </Button>
                                            <Dropdown.Popover isNonModal={true}>
                                                <Dropdown.Menu aria-label="Recording actions">
                                                    <Dropdown.Item key="select" onPress={() => { toggleSelectionMode(); toggleSelect(rec.id); }}>
                                                        Select
                                                    </Dropdown.Item>
                                                    <Dropdown.Item key="play" onPress={() => onOpenDialog(rec)}>
                                                        <div className="flex items-center gap-2"><Play className="h-4 w-4 text-primary" /> Play Audio</div>
                                                    </Dropdown.Item>
                                                    <Dropdown.Item key="view" onPress={() => onOpenDialog(rec)}>
                                                        <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-secondary" /> View Transcript</div>
                                                    </Dropdown.Item>
                                                    {(rec.transcriptionStatus === 'failed' || rec.transcriptionStatus === 'pending' || rec.transcriptionStatus === 'processing') && onRetryTranscription && (
                                                        <Dropdown.Item key="retry" onPress={() => onRetryTranscription(rec)}>
                                                            <div className="flex items-center gap-2"><RefreshCcw className="h-4 w-4 text-warning" /> Retry Transcription</div>
                                                        </Dropdown.Item>
                                                    )}
                                                    <Dropdown.Item key="delete" className="text-danger" onPress={() => onDeleteRequest([rec])}>
                                                        Delete
                                                    </Dropdown.Item>
                                                </Dropdown.Menu>
                                            </Dropdown.Popover>
                                        </Dropdown>
                                    )}
                                </div>
                            </div>

                            <div className="pl-[46px]" onClick={() => isSelectionMode ? toggleSelect(rec.id) : onOpenDialog(rec)}>
                                <div className="mb-1.5 bg-default-100/30 p-2 rounded-lg border border-default-100/50" onClick={(e) => e.stopPropagation()}>
                                    <ExpandableSummary
                                        text={rec.summary || (rec.fullTranscript && rec.fullTranscript[0]?.text) || "No transcript available..."}
                                        compactMaxLength={density === 'dense' ? 70 : 100}
                                        className="text-default-600 text-sm"
                                    />
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <Chip variant="soft" color="default" size="sm">
                                        {formatDurationLocal(rec.duration)}
                                    </Chip>
                                    <span className="text-[10px] text-default-400">
                                        <ClientFormattedDate date={rec.recordedAt} formatString="h:mm a" />
                                    </span>
                                    {/* Provider Badge with Cost */}
                                    {(rec.transcriptionProvider || rec.transcriptionModel) && (
                                        <>
                                            <span className="text-[10px] text-default-300">•</span>
                                            {rec.transcriptionProvider === 'elevenlabs' ? (
                                                <span className="flex items-center gap-0.5">
                                                    <span className="text-[9px] font-bold text-purple-600 uppercase tracking-wider">
                                                        ElevenLabs
                                                    </span>
                                                    {rec.transcriptionCostMultiplier && rec.transcriptionCostMultiplier > 1 && (
                                                        <span className="text-[9px] font-bold text-amber-600">
                                                            ({rec.transcriptionCostMultiplier}x)
                                                        </span>
                                                    )}
                                                </span>
                                            ) : rec.transcriptionProvider === 'soniox' ? (
                                                <span className="text-[9px] font-bold text-blue-600 uppercase tracking-wider">
                                                    Soniox
                                                </span>
                                            ) : null}
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })
            ) : (
                <div className="p-8 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                        <div className="p-3 rounded-xl bg-default-50 border border-default-100">
                            <FileText className="h-6 w-6 text-default-400" />
                        </div>
                        <p className="text-default-500 text-sm">No recordings found</p>
                        <Link href="/upload">
                            <Button variant="secondary" className="rounded-full">
                                Upload a recording
                            </Button>
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
});
