import React from 'react';
import { Card } from '@heroui/react';
import { ClientFormattedDate } from '@/components/client-formatted-date';
import type { Recording } from '@/lib/types';
import { formatDuration } from '@/components/recordings-table/format-duration';

type UserRecordingsPanelProps = {
    recordings: Recording[];
};

export function UserRecordingsPanel({ recordings }: UserRecordingsPanelProps) {
    return (
        <Card className="rounded-[1.9rem] border border-default-200/80 bg-background/95 shadow-[0_24px_64px_-48px_rgba(15,23,42,0.45)]">
            <Card.Header className="border-b border-default-100/70 px-6 py-5">
                <div className="flex flex-col">
                    <h3 className="text-lg font-bold tracking-[-0.03em] text-foreground">User recordings</h3>
                    <p className="text-small text-default-500">A list of all recordings associated with this user.</p>
                </div>
            </Card.Header>
            <Card.Content className="p-6">
                <div className="overflow-hidden rounded-[1.25rem] border border-default-200/80">
                    <table className="w-full text-sm text-left">
                        <thead className="text-default-500 font-medium bg-default-50 border-b border-default-200">
                            <tr>
                                <th className="h-10 px-4 align-middle">Date</th>
                                <th className="h-10 px-4 align-middle">Duration</th>
                                <th className="h-10 px-4 align-middle">Transcript Snippet</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-default-100">
                            {recordings.length > 0 ? (
                                recordings.map((recording) => (
                                    <tr key={recording.id}>
                                        <td className="p-4 align-middle">
                                            <ClientFormattedDate date={recording.recordedAt} formatString="PPp" />
                                        </td>
                                        <td className="p-4 align-middle">{formatDuration(recording.duration)}</td>
                                        <td className="p-4 align-middle text-default-500 truncate max-w-sm">
                                            {recording.summary ||
                                                (recording.fullTranscript && recording.fullTranscript[0]?.text) ||
                                                '-'}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={3} className="p-4 text-center">
                                        No recordings.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card.Content>
        </Card>
    );
}
