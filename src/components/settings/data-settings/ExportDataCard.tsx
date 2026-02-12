import { Card, Button, Spinner } from '@heroui/react';
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
    return (
        <Card className="bg-card/70 border-default-200">
            <Card.Content className="space-y-4">
                <div className="flex flex-col gap-4 p-4 border rounded-lg bg-default-50/50">
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg text-primary">
                            <Archive className="w-5 h-5" />
                        </div>
                        <div className="space-y-1">
                            <h4 className="font-medium">Full Data Export</h4>
                            <p className="text-sm text-default-500">
                                Create a downloadable archive of all your data. Audio files are organized by contact and date.
                                Includes a <b>premium offline viewer</b> to browse your history without an internet connection.
                            </p>
                        </div>
                    </div>

                    {exportJob && (
                        <div className="mt-2 p-3 bg-default-100 rounded-lg space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="font-medium capitalize text-default-700">Status: {exportJob.status}</span>
                                <span className="text-default-500">{new Date(exportJob.createdAt).toLocaleDateString()}</span>
                            </div>

                            {exportJob.status === 'processing' && (
                                <div className="space-y-1">
                                    <div className="h-2 w-full bg-default-200 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-primary transition-all duration-500 animate-pulse"
                                            style={{ width: `${Math.max(5, exportJob.progress)}%` }}
                                        />
                                    </div>
                                    <p className="text-xs text-default-500 text-right">{exportJob.progress}% processed</p>
                                </div>
                            )}

                            {exportJob.status === 'failed' && (
                                <p className="text-sm text-danger bg-danger/10 p-2 rounded">
                                    Error: {exportJob.error || 'Export failed'}
                                </p>
                            )}

                            {exportJob.status === 'completed' && exportJob.parts && (
                                <div className="space-y-2 pt-2 border-t border-default-200">
                                    <p className="text-sm font-medium">Download Links (Expire in 7 days):</p>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        {exportJob.parts.map((part, i) => (
                                            <a key={i} href={part.url} target="_blank" rel="noopener noreferrer" className="block">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="w-full flex items-center justify-center gap-2"
                                                >
                                                    <Download className="w-4 h-4" />
                                                    Download Part {i + 1}
                                                </Button>
                                            </a>
                                        ))}
                                    </div>
                                    <p className="text-xs text-default-400 mt-2">
                                        Tip: Extract all parts into the same folder.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </Card.Content>
            <Card.Footer className="justify-between">
                <p className="text-xs text-default-400">
                    Exports may take a while for large libraries. You will be notified via email.
                </p>
                <Button
                    onPress={onStartExport}
                    isDisabled={isExportStarting || exportJob?.status === 'pending' || exportJob?.status === 'processing'}
                    variant="primary"
                >
                    {isExportStarting ? (
                        <div className="flex items-center gap-2">
                            <Spinner size="sm" color="current" />
                            <span>Starting...</span>
                        </div>
                    ) : (
                        exportJob?.status === 'processing' ? 'Processing...' : 'Start New Export'
                    )}
                </Button>
            </Card.Footer>
        </Card>
    );
}
