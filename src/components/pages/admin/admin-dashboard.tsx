"use client";

import { useTransition } from 'react';
import { HealthDashboard } from '@/components/admin/health-dashboard';
import { Users, Phone, HardDrive, FileAudio, AlertTriangle, Trash2, ArrowRight } from 'lucide-react';
import { Button, Card, Spinner } from '@heroui/react';
import Link from 'next/link';
import { cleanupOrphanedRecordings } from '@/app/actions/admin';
import { useRouter } from 'next/navigation';
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
    const [isPending, startTransition] = useTransition();
    const router = useRouter();

    const handleCleanup = () => {
        if (!confirm(`Are you sure you want to delete ${orphanedCount} orphaned recordings?`)) {
            return;
        }

        startTransition(async () => {
            const result = await cleanupOrphanedRecordings();
            alert(`Cleanup complete: Removed ${result.deletedDb} database records and ${result.deletedR2} files.`);
            router.refresh();
        });
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
            description="Monitor system health, storage, user volume, and maintenance issues from the top-level control surface."
            actions={
                <>
                    <Link href="/admin/users">
                        <Button variant="secondary" className="w-full rounded-full px-6 font-semibold">
                            Manage users
                        </Button>
                    </Link>
                    <Link href="/admin/audit">
                        <Button className="w-full rounded-full px-6 font-semibold">
                            Open audit logs
                            <ArrowRight className="h-4 w-4" />
                        </Button>
                    </Link>
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
                <HealthDashboard />

                {orphanedCount > 0 && (
                    <Card className="border border-warning/50 bg-warning/5 rounded-[1.5rem] shadow-[0_20px_54px_-44px_rgba(15,23,42,0.45)]">
                        <Card.Header className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                            <div className="flex items-center gap-3">
                                <div className="rounded-2xl bg-warning/10 p-2 text-warning">
                                    <AlertTriangle className="h-5 w-5" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-foreground">System maintenance required</h3>
                                    <p className="text-sm text-default-500">
                                        Found {orphanedCount} orphaned recordings with no associated user.
                                    </p>
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                className="rounded-full text-warning hover:bg-warning/10"
                                isDisabled={isPending}
                                onPress={handleCleanup}
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
