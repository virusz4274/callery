import { ActionLink } from '@/components/action-link';
import { Button, Card, Chip, Spinner } from '@heroui/react';
import { Archive, Download } from 'lucide-react';
import type { ExportJobResponse } from '@/lib/db/types';

interface ExportDataProps {
    exportJob: ExportJobResponse | null;
    isExportStarting: boolean;
    onStartExport: () => void;
}

export function ExportDataCard({
    exportJob,
    isExportStarting,
    onStartExport
}: ExportDataProps) {
    const isQueued = exportJob?.status === 'pending';
    const isProcessing = exportJob?.status === 'processing';
    const isBusy = isExportStarting || isQueued || isProcessing;

    return (
        <Card className="rounded-2xl border border-border bg-surface shadow-none">
            <Card.Content className="space-y-5 p-5 sm:p-6">

                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                            <Archive className="h-5 w-5" />
                        </div>
                        <div className="space-y-2">
                            <h4 className="text-lg font-semibold tracking-[-0.03em] text-foreground">Export your full library</h4>
                            <p className="max-w-2xl text-sm leading-6 text-default-500">
                                Download audio, transcripts, metadata, and an offline viewer.
                            </p>
                        </div>
                    </div>

                    <Button
                        onPress={onStartExport}
                        isDisabled={isBusy}
                        variant="primary"
                        className="w-full gap-2 rounded-full sm:w-auto"
                    >
                        {isExportStarting ? (
                            <>
                                <Spinner size="sm" color="current" />
                                Starting...
                            </>
                        ) : isQueued ? (
                            'Queued for export'
                        ) : isProcessing ? (
                            'Export running'
                        ) : (
                            'Start export'
                        )}
                    </Button>
                </div>
                <p className="text-sm text-muted">Large exports may take a while. Download links expire after 7 days.</p>

                {exportJob && (
                    <div className="rounded-xl border border-default-200/80 bg-background p-4 sm:p-5">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p className="text-sm font-semibold text-foreground">Latest export job</p>
                                <p className="text-sm text-default-500">Created {new Date(exportJob.createdAt).toLocaleString()}</p>
                            </div>
                            <Chip
                                size="sm"
                                variant="soft"
                                color={exportJob.status === 'completed' ? 'success' : exportJob.status === 'failed' ? 'danger' : 'warning'}
                            >
                                {exportJob.status}
                            </Chip>
                        </div>

                        {exportJob.status === 'pending' && (
                            <div className="mt-4 rounded-xl bg-warning/10 px-4 py-3 text-sm text-warning-700">
                                Export queued.
                            </div>
                        )}

                        {exportJob.status === 'processing' && (
                            <div className="mt-4 space-y-2">
                                <div className="h-2.5 overflow-hidden rounded-full bg-default-100">
                                    <div
                                        className="h-full rounded-full bg-primary transition-all duration-500"
                                        style={{ width: `${Math.max(5, exportJob.progress)}%` }}
                                    />
                                </div>
                                <p className="text-sm text-default-500">{exportJob.progress}% processed</p>
                            </div>
                        )}

                        {exportJob.status === 'failed' && (
                            <div className="mt-4 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
                                {exportJob.error || 'Export failed'}
                            </div>
                        )}

                        {exportJob.status === 'completed' && (
                            <div className="mt-4 space-y-3 border-t border-default-100/80 pt-4">
                                <p className="text-sm font-medium text-foreground">Download packages</p>
                                <div className="grid gap-2 sm:grid-cols-2">
                                    {exportJob.parts.map((part, index) => (
                                        <ActionLink key={index} href={part.url} target="_blank" rel="noopener noreferrer" size="sm" variant="outline" className="w-full justify-center gap-2">
                                                <Download className="h-4 w-4" />
                                                Download part {index + 1}
                                            </ActionLink>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </Card.Content>
        </Card>
    );
}
