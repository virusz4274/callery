
import React, { memo } from 'react';
import { Recording } from '@/lib/types';
import { Checkbox, Avatar, Button, Dropdown } from '@heroui/react';
import { Play, MoreHorizontal, Download, Trash2, FileText, RefreshCcw } from 'lucide-react';
import { ClientFormattedDate } from '../client-formatted-date';
import { ExpandableSummary } from '../expandable-summary';
import { TableSelectionState } from './types';

// Helper for duration formatting if not imported
const formatDurationLocal = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

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
    onRetryTranscription
}: RecordingsTableDesktopProps) {
    const { isAllSelected, toggleSelectAll, isSelected, toggleSelect } = selection;

    return (
        <div className="hidden md:block relative w-full overflow-hidden">
            <table className="w-full text-sm text-left">
                <thead className="text-xs uppercase tracking-wider text-default-500 font-semibold bg-default-50/50 border-b border-default-200/50">
                    <tr>
                        <th className="h-14 w-14 px-4 align-middle">
                            <div className="flex items-center justify-center">
                                <Checkbox
                                    isSelected={isAllSelected}
                                    onChange={toggleSelectAll}
                                    aria-label="Select all"
                                    className="group-data-[selected=true]:border-primary"
                                />
                            </div>
                        </th>
                        <th className="h-14 px-4 align-middle">Contact</th>
                        <th className="h-14 px-4 align-middle">Recording Details</th>
                        <th className="h-14 px-4 align-middle">Date</th>
                        <th className="h-14 px-4 align-middle text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-default-100/50">
                    {recordings.length > 0 ? (
                        recordings.map((rec) => {
                            const selected = isSelected(rec.id);

                            return (
                                <tr
                                    key={rec.id}
                                    className={`group transition-all duration-200 ${selected ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-default-100/50'}`}
                                >
                                    <td className="p-4 align-middle">
                                        <div className="flex items-center justify-center">
                                            <Checkbox
                                                isSelected={selected}
                                                onChange={() => toggleSelect(rec.id)}
                                                aria-label="Select row"
                                            />
                                        </div>
                                    </td>
                                    <td className="p-4 align-middle">
                                        <div className="flex items-center gap-4">
                                            <Avatar
                                                className={`h-10 w-10 transition-transform group-hover:scale-105 ring-2 ${selected ? 'ring-primary' : 'ring-transparent group-hover:ring-default-200'}`}
                                                color={selected ? "success" : "default"}
                                            >
                                                {/* <Avatar.Image src={avatar?.imageUrl} alt={rec.contactName || "Unknown"} /> */}
                                                <Avatar.Fallback>{rec.contactName ? rec.contactName.charAt(0) : '#'}</Avatar.Fallback>
                                            </Avatar>
                                            <div>
                                                <div className={`font-semibold ${selected ? 'text-primary' : 'text-foreground'}`}>
                                                    {rec.contactName || 'Unknown Caller'}
                                                </div>
                                                <div className="text-xs text-default-500 font-mono">{rec.phoneNumber}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-4 align-middle">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-2">
                                                <span className="px-2 py-0.5 rounded-full bg-default-100 text-[10px] font-bold text-default-600 uppercase tracking-wide">
                                                    {formatDurationLocal(rec.duration)}
                                                </span>
                                            </div>
                                            <div className="opacity-80 group-hover:opacity-100 transition-opacity max-w-[200px] lg:max-w-xs text-wrap">
                                                <ExpandableSummary
                                                    text={rec.summary || (rec.fullTranscript && rec.fullTranscript[0]?.text) || "No transcript available..."}
                                                    compactMaxLength={60}
                                                    className="text-default-500"
                                                />
                                            </div>
                                            {/* Provider Badge with Cost */}
                                            {(rec.transcriptionProvider || rec.transcriptionModel) && (
                                                <div className="flex gap-1 mt-1">
                                                    {rec.transcriptionProvider === 'elevenlabs' ? (
                                                        <div className="flex items-center gap-1">
                                                            <div className="px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-600 text-[9px] font-bold border border-purple-200 uppercase tracking-wider">
                                                                ElevenLabs
                                                            </div>
                                                            {rec.transcriptionCostMultiplier && rec.transcriptionCostMultiplier > 1 && (
                                                                <div className="px-1 py-0.5 rounded bg-amber-500/10 text-amber-600 text-[9px] font-bold border border-amber-200">
                                                                    {rec.transcriptionCostMultiplier}x
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : rec.transcriptionProvider === 'soniox' ? (
                                                        <div className="px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 text-[9px] font-bold border border-blue-200 uppercase tracking-wider">
                                                            Soniox
                                                        </div>
                                                    ) : null}
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-4 align-middle">
                                        <div className="text-sm text-default-600">
                                            <ClientFormattedDate date={rec.recordedAt} formatString="MMM d, yyyy" />
                                        </div>
                                        <div className="text-xs text-default-400">
                                            <ClientFormattedDate date={rec.recordedAt} formatString="h:mm a" />
                                        </div>
                                    </td>
                                    <td className="p-4 align-middle text-right">
                                        <div className="relative flex justify-end items-center gap-2">
                                            <Button
                                                isIconOnly
                                                size="sm"
                                                variant="ghost"
                                                className="text-default-400 data-[hover=true]:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                                                onPress={() => onOpenDialog(rec)}
                                            >
                                                <Play className="h-4 w-4 fill-current" />
                                            </Button>
                                            <Dropdown>
                                                <Button variant="ghost" isIconOnly size="sm" className="text-default-400 data-[hover=true]:text-foreground">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                    <span className="sr-only">Actions</span>
                                                </Button>
                                                <Dropdown.Popover>
                                                    <Dropdown.Menu aria-label="Recording actions">
                                                        <Dropdown.Item
                                                            key="play"
                                                            textValue="Play Audio"
                                                            onPress={() => onOpenDialog(rec)}
                                                        >
                                                            <div className="flex items-center gap-2"><Play className="h-4 w-4 text-primary" /> Play Audio</div>
                                                        </Dropdown.Item>
                                                        <Dropdown.Item
                                                            key="view"
                                                            textValue="View Transcript"
                                                            onPress={() => onOpenDialog(rec)}
                                                        >
                                                            <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-secondary" /> View Transcript</div>
                                                        </Dropdown.Item>
                                                        {(rec.transcriptionStatus === 'failed' || rec.transcriptionStatus === 'pending' || rec.transcriptionStatus === 'processing') && onRetryTranscription && (
                                                            <Dropdown.Item
                                                                key="retry"
                                                                textValue="Retry Transcription"
                                                                onPress={() => onRetryTranscription(rec)}
                                                            >
                                                                <div className="flex items-center gap-2"><RefreshCcw className="h-4 w-4 text-warning" /> Retry Transcription</div>
                                                            </Dropdown.Item>
                                                        )}
                                                        <Dropdown.Item key="download" textValue="Download" onPress={() => console.log('Download clicked')}>
                                                            <div className="flex items-center gap-2"><Download className="h-4 w-4 text-success" /> Download</div>
                                                        </Dropdown.Item>
                                                        <Dropdown.Item
                                                            key="delete"
                                                            className="text-danger"
                                                            textValue="Delete"
                                                            onPress={() => onDeleteRequest([rec])}
                                                        >
                                                            <div className="flex items-center gap-2"><Trash2 className="h-4 w-4" /> Delete</div>
                                                        </Dropdown.Item>
                                                    </Dropdown.Menu>
                                                </Dropdown.Popover>
                                            </Dropdown>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })
                    ) : (
                        <tr>
                            <td colSpan={5} className="p-24 text-center">
                                <div className="flex flex-col items-center justify-center gap-4">
                                    <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-default-100 to-default-50 shadow-inner border border-default-200/50 flex items-center justify-center mb-2">
                                        <FileText className="h-10 w-10 text-default-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-foreground">No recordings found</h3>
                                        <p className="text-default-500 mt-1 max-w-[250px] mx-auto">
                                            Upload new calls or wait for them to appear here.
                                        </p>
                                    </div>
                                </div>
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
});
