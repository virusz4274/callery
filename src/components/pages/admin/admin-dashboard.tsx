"use client";

import React, { useTransition } from 'react';
import { AdminStatsCard } from '@/components/admin/admin-stats-card';
import { Users, Phone, HardDrive, FileAudio, AlertTriangle, Trash2 } from 'lucide-react';
import { Button, Card, Spinner } from '@heroui/react';
import Link from 'next/link';
import { cleanupOrphanedRecordings } from '@/app/actions/admin';
import { useRouter } from 'next/navigation';

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
        <div className="space-y-6">
            <div className="flex flex-row items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
                    <p className="text-default-500">System-wide overview and statistics.</p>
                </div>
                <div className="flex gap-2">
                    <Link href="/admin/users">
                        <Button variant="primary">
                            Manage Users
                        </Button>
                    </Link>
                </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <AdminStatsCard
                    title="Total Users"
                    value={totalUsers}
                    icon={<Users className="h-4 w-4" />}
                    description="Active users in system"
                />
                <AdminStatsCard
                    title="Total Recordings"
                    value={totalRecordings}
                    icon={<Phone className="h-4 w-4" />}
                    description="Across all users"
                />
                <AdminStatsCard
                    title="Storage Used"
                    value={`${storageInGB} GB`}
                    icon={<HardDrive className="h-4 w-4" />}
                    description="Total cloud storage"
                />
                <AdminStatsCard
                    title="Transcription Used"
                    value={`${transcriptionHours}h ${transcriptionMinutes}m`}
                    icon={<FileAudio className="h-4 w-4" />}
                    description="Total transcribed audio"
                />
            </div>

            {/* System Maintenance Section */}
            {orphanedCount > 0 && (
                <Card className="border border-warning/50 bg-warning/5">
                    <Card.Header className="flex flex-row items-center justify-between p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-warning/10 text-warning">
                                <AlertTriangle className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-foreground">System Maintenance Required</h3>
                                <p className="text-sm text-default-500">
                                    Found {orphanedCount} orphaned recordings (no associated user).
                                </p>
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            className="text-warning hover:bg-warning/10"
                            isDisabled={isPending}
                            onPress={handleCleanup}
                        >
                            {isPending ? <Spinner size="sm" color="warning" /> : (
                                <div className="flex items-center gap-2">
                                    <Trash2 className="h-4 w-4" />
                                    <span>Clean Up Now</span>
                                </div>
                            )}
                        </Button>
                    </Card.Header>
                </Card>
            )}
        </div>
    );
}
