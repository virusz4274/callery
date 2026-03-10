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
        <Card>
            <Card.Header>
                <div className="flex flex-col">
                    <h3 className="text-lg font-bold">User Recordings</h3>
                    <p className="text-small text-default-500">A list of all recordings associated with this user.</p>
                </div>
            </Card.Header>
            <Card.Content>
                <div className="rounded-lg border border-default-200 overflow-hidden">
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
