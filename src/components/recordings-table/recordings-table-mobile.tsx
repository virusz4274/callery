
import React, { memo } from 'react';
import { Recording, Contact } from '@/lib/types';
import { Avatar, Button, Dropdown } from '@heroui/react';
import { MoreHorizontal, FileText, RefreshCcw } from 'lucide-react';
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
}

export const RecordingsTableMobile = memo(function RecordingsTableMobile({
    recordings,
    selection,
    onOpenDialog,
    onDeleteRequest,
    onRetryTranscription
}: RecordingsTableMobileProps) {
    const { isSelected, toggleSelect } = selection;

    return (
        <div className="md:hidden flex flex-col divide-y divide-default-100/50">
            {recordings.length > 0 ? (
                recordings.map((rec) => {
                    const selected = isSelected(rec.id);

                    return (
                        <div
                            key={rec.id}
                            className={`p-4 transition-colors ${selected ? 'bg-primary/5' : ''}`}
                        >
                            <div className="flex items-start justify-between gap-3 mb-3">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="relative">
                                        <Avatar
                                            className={`h-10 w-10 ring-2 ${selected ? 'ring-primary' : 'ring-transparent'}`}
                                            color={selected ? "success" : "default"}
                                            onClick={() => toggleSelect(rec.id)}
                                        >
                                            {/* <Avatar.Image src={avatar?.imageUrl} alt={rec.contactName || "Unknown"} /> */}
                                            <Avatar.Fallback>{rec.contactName ? rec.contactName.charAt(0) : '#'}</Avatar.Fallback>
                                        </Avatar>
                                        {selected && (
                                            <div className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground rounded-full p-0.5 border-2 border-background">
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                        <div className="font-semibold text-foreground truncate" onClick={() => onOpenDialog(rec)}>
                                            {rec.contactName || 'Unknown Caller'}
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-default-500">
                                            <span className="font-mono">{rec.phoneNumber}</span>
                                            <span>•</span>
                                            <ClientFormattedDate date={rec.recordedAt} formatString="MMM d" />
                                        </div>
                                    </div>
                                </div>

                                <Dropdown>
                                    <Button variant="ghost" isIconOnly size="sm" className="-mr-2 text-default-400">
                                        <MoreHorizontal className="h-5 w-5" />
                                    </Button>
                                    <Dropdown.Popover placement="bottom end">
                                        <Dropdown.Menu aria-label="Recording actions">
                                            <Dropdown.Item key="select" onPress={() => toggleSelect(rec.id)}>
                                                {selected ? "Deselect" : "Select"}
                                            </Dropdown.Item>
                                            <Dropdown.Item key="play" onPress={() => onOpenDialog(rec)}>
                                                <div className="flex items-center gap-2">Play Audio</div>
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
                            </div>

                            <div className="pl-[52px]" onClick={() => onOpenDialog(rec)}>
                                <div className="mb-2 bg-default-50/50 p-2 rounded-lg border border-default-100/50" onClick={(e) => e.stopPropagation()}>
                                    <ExpandableSummary
                                        text={rec.summary || (rec.fullTranscript && rec.fullTranscript[0]?.text) || "No transcript available..."}
                                        compactMaxLength={100}
                                        className="text-default-600"
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="px-2 py-0.5 rounded-full bg-default-100 text-[10px] font-bold text-default-600 uppercase tracking-wide">
                                        {formatDurationLocal(rec.duration)}
                                    </span>
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
                <div className="p-12 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                        <div className="p-4 rounded-xl bg-default-50 border border-default-100">
                            <FileText className="h-8 w-8 text-default-400" />
                        </div>
                        <p className="text-default-500 text-sm">No recordings found</p>
                    </div>
                </div>
            )}
        </div>
    );
});
