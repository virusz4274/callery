import { Button, Card, Chip, Spinner } from '@heroui/react';
import { Archive, Download, FolderArchive, Hourglass } from 'lucide-react';
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
    return (
        <Card className="rounded-[1.6rem] border border-default-200/80 bg-background/95 shadow-[0_20px_56px_-44px_rgba(15,23,42,0.45)]">
            <Card.Content className="space-y-5 p-5 sm:p-6">
                <div className="flex flex-wrap items-center gap-2">
                    <Chip size="sm" variant="soft" color="accent">Portable archive</Chip>
                    <Chip size="sm" variant="soft" color="default">Offline viewer included</Chip>
                </div>

                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                            <Archive className="h-5 w-5" />
                        </div>
                        <div className="space-y-2">
                            <h4 className="text-lg font-semibold tracking-[-0.03em] text-foreground">Export your full library</h4>
                            <p className="max-w-2xl text-sm leading-6 text-default-500">
                                Build a downloadable archive of recordings, transcripts, and metadata organized by contact and date, with an offline browser for review.
                            </p>
                        </div>
                    </div>

                    <Button
                        onPress={onStartExport}
                        isDisabled={isExportStarting || exportJob?.status === 'pending' || exportJob?.status === 'processing'}
                        variant="primary"
                        className="w-full gap-2 rounded-full sm:w-auto"
                    >
                        {isExportStarting ? (
                            <>
                                <Spinner size="sm" color="current" />
                                Starting...
                            </>
                        ) : exportJob?.status === 'processing' ? (
                            'Export running'
                        ) : (
                            'Start export'
                        )}
                    </Button>
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
                    <div className="rounded-[1.3rem] border border-default-200/80 bg-default-50/70 p-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                            <FolderArchive className="h-4 w-4 text-primary" />
                            What you get
                        </div>
                        <p className="mt-2 text-sm leading-6 text-default-500">
                            Audio files, transcripts, metadata, and a standalone viewer so your team can browse history without logging into the app.
                        </p>
                    </div>
                    <div className="rounded-[1.3rem] border border-default-200/80 bg-default-50/70 p-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                            <Hourglass className="h-4 w-4 text-primary" />
                            Delivery
                        </div>
                        <p className="mt-2 text-sm leading-6 text-default-500">
                            Large libraries may take a while. Links expire after 7 days once the export is complete.
                        </p>
                    </div>
                </div>

                {exportJob && (
                    <div className="rounded-[1.4rem] border border-default-200/80 bg-background p-4 sm:p-5">
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

                        {exportJob.status === 'completed' && exportJob.parts && (
                            <div className="mt-4 space-y-3 border-t border-default-100/80 pt-4">
                                <p className="text-sm font-medium text-foreground">Download packages</p>
                                <div className="grid gap-2 sm:grid-cols-2">
                                    {exportJob.parts.map((part, index) => (
                                        <a key={index} href={part.url} target="_blank" rel="noopener noreferrer" className="block">
                                            <Button size="sm" variant="outline" className="w-full justify-center gap-2">
                                                <Download className="h-4 w-4" />
                                                Download part {index + 1}
                                            </Button>
                                        </a>
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
