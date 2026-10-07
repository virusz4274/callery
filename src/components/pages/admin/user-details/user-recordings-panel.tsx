import { Card, Table } from '@heroui/react';
import { ClientFormattedDate } from '@/components/client-formatted-date';
import type { Recording } from '@/lib/types';
import { recordingPreview } from '@/lib/recording-summary';
import { formatDuration } from '@/components/recordings-table/format-duration';

type UserRecordingsPanelProps = {
    recordings: Recording[];
};

export function UserRecordingsPanel({ recordings }: UserRecordingsPanelProps) {
    return (
        <Card>
            <Card.Header className="border-b border-border px-6 py-5">
                <div className="flex flex-col">
                    <h3 className="text-lg font-bold text-foreground">User recordings</h3>
                    <p className="text-small text-muted">A list of all recordings associated with this user.</p>
                </div>
            </Card.Header>
            <Card.Content className="p-6">
                <div className="min-w-0">
                    <Table><Table.ScrollContainer><Table.Content aria-label="User recordings">
                        <Table.Header>
                                <Table.Column id="column-1" isRowHeader>Date</Table.Column>
                                <Table.Column id="column-2">Duration</Table.Column>
                                <Table.Column id="column-3">Conversation</Table.Column>
                            </Table.Header>
                        <Table.Body renderEmptyState={() => <p className="py-6 text-center text-muted">No recordings.</p>}>
                            {(
                                recordings.map((recording) => (
                                    <Table.Row key={recording.id} id={recording.id}>
                                        <Table.Cell className="p-4 align-middle">
                                            <ClientFormattedDate date={recording.recordedAt} formatString="PPp" />
                                        </Table.Cell>
                                        <Table.Cell className="p-4 align-middle">{formatDuration(recording.duration)}</Table.Cell>
                                        <Table.Cell className="p-4 align-middle text-muted max-w-sm break-words">
                                            <p className="line-clamp-3">{recordingPreview(recording) || 'No summary available'}</p>
                                        </Table.Cell>
                                    </Table.Row>
                                ))
                            )}
                        </Table.Body>
                    </Table.Content></Table.ScrollContainer></Table>
                </div>
            </Card.Content>
        </Card>
    );
}
