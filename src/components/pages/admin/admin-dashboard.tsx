"use client";

import { ActionLink } from '@/components/action-link';
import { useRef, useState } from 'react';
import { HealthDashboard } from '@/components/admin/health-dashboard';
import { Users, Phone, HardDrive, FileAudio, AlertTriangle, Trash2, ArrowRight } from 'lucide-react';
import { Button, Card, Spinner } from '@heroui/react';
import { cleanupOrphanedRecordings } from '@/app/actions/admin';
import { useRouter } from 'next/navigation';
import { ConfirmActionDialog } from '@/components/admin/confirm-action-dialog';
import { useToast } from '@/components/toast-provider';
import { AdminPageShell } from '@/components/admin/admin-page-shell';

type AdminDashboardProps = {
    stats: {
        totalUsers: number;
        totalRecordings: number;
        totalStorageUsed: number;
        totalTranscriptionUsed: number;
    };
    orphanedCount: number;
};

export function AdminDashboard({ stats, orphanedCount }: AdminDashboardProps) {
    const { totalUsers, totalRecordings, totalStorageUsed, totalTranscriptionUsed } = stats;
    const [isPending, setPending] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const busy = useRef(false);
    const { toast } = useToast();
    const router = useRouter();

    const handleCleanup = async () => {
        if (busy.current) return;
        busy.current = true; setPending(true); setError(null);
        try {
            const result = await cleanupOrphanedRecordings();
            toast({ title: 'Cleanup complete', description: `Removed ${result.deletedDb ?? 0} database records and ${result.deletedR2 ?? 0} files.`, status: 'success' });
            setConfirming(false); router.refresh();
        } catch (error) { setError(error instanceof Error ? error.message : 'Please try again.'); }
        finally { busy.current = false; setPending(false); }
    };

    // Convert bytes to GB
    const storageInGB = (totalStorageUsed / (1024 * 1024 * 1024)).toFixed(2);

    // Convert seconds to Hours:Minutes
    const transcriptionHours = Math.floor(totalTranscriptionUsed / 3600);
    const transcriptionMinutes = Math.floor((totalTranscriptionUsed % 3600) / 60);

    return (
        <AdminPageShell
            eyebrow="Operations overview"
            title="Admin dashboard"

            actions={
                <>
                    <ActionLink href="/admin/users" variant="secondary" className="min-h-11 gap-2 px-4">
                            Manage users
                        </ActionLink>
                    <ActionLink href="/admin/audit" className="min-h-11 gap-2 px-4">
                            Open audit logs
                            <ArrowRight className="h-4 w-4" />
                        </ActionLink>
                </>
            }
            stats={[
                {
                    label: 'Users',
                    value: totalUsers,
                    helper: 'Accounts currently registered in the system',
                    icon: Users,
                },
                {
                    label: 'Recordings',
                    value: totalRecordings,
                    helper: 'Library size across every workspace',
                    icon: Phone,
                },
                {
                    label: 'Storage',
                    value: `${storageInGB} GB`,
                    helper: 'Cloud storage currently allocated',
                    icon: HardDrive,
                },
                {
                    label: 'Transcription',
                    value: `${transcriptionHours}h ${transcriptionMinutes}m`,
                    helper: 'Audio already processed for transcripts',
                    icon: FileAudio,
                },
            ]}
        >
            <div className="space-y-6">
                {confirming && <ConfirmActionDialog title="Clean up orphaned recordings?" description={`Permanently delete ${orphanedCount} recordings with no associated user, including their stored audio files.`} label="Clean up recordings" pending={isPending} error={error} onConfirm={() => void handleCleanup()} onClose={() => setConfirming(false)} />}
                <HealthDashboard />

                {orphanedCount > 0 && (
                    <Card className="border-warning/50 bg-warning/5">
                        <Card.Header className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                            <div className="flex items-center gap-3">
                                <div className="rounded-2xl bg-warning/10 p-2 text-warning">
                                    <AlertTriangle className="h-5 w-5" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-foreground">System maintenance required</h3>
                                    <p className="text-sm text-muted">
                                        Found {orphanedCount} orphaned recordings with no associated user.
                                    </p>
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                className="text-warning hover:bg-warning/10"
                                isDisabled={isPending}
                                onPress={() => { setError(null); setConfirming(true); }}
                            >
                                {isPending ? <Spinner size="sm" color="warning" /> : (
                                    <div className="flex items-center gap-2">
                                        <Trash2 className="h-4 w-4" />
                                        <span>Clean up now</span>
                                    </div>
                                )}
                            </Button>
                        </Card.Header>
                    </Card>
                )}
            </div>
        </AdminPageShell>
    );
}
