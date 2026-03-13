'use client';

import React from 'react';
import Link from 'next/link';
import { Button, Chip, Skeleton, Surface } from '@heroui/react';
import { ArrowRight, DatabaseZap, ShieldCheck, Sparkles } from 'lucide-react';
import { StatsGrid } from '@/components/settings/stats-grid';
import { useStats } from '@/hooks/use-stats';

export function OverviewSettings() {
    const { stats, isLoading, error } = useStats();

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div className="space-y-2">
                    <Skeleton className="h-5 w-28 rounded-full" />
                    <Skeleton className="h-10 w-72 rounded-2xl" />
                    <Skeleton className="h-5 w-full max-w-2xl rounded-full" />
                </div>
                <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                    {[1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} className="h-40 rounded-[1.5rem]" />
                    ))}
                </div>
                <div className="grid gap-4 xl:grid-cols-2">
                    {[1, 2].map((i) => (
                        <Skeleton key={i} className="h-56 rounded-[1.75rem]" />
                    ))}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="rounded-[1.5rem] border border-danger/20 bg-danger/10 p-4 text-danger">
                Failed to load stats: {error.message}
            </div>
        );
    }

    const summary = stats || { totalRecordings: 0, newThisMonth: 0, unknownCallers: 0, avgDuration: 0 };
    const avgMinutes = Math.floor(summary.avgDuration / 60);
    const avgSeconds = summary.avgDuration % 60;
    const avgDurationLabel = `${avgMinutes}m ${String(avgSeconds).padStart(2, '0')}s`;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-3">
                    <Chip variant="soft" color="accent" className="rounded-full px-3 py-1 text-xs font-medium">
                        Overview
                    </Chip>
                    <div className="space-y-2">
                        <h2 className="text-3xl font-black tracking-[-0.04em] text-foreground">
                            Workspace snapshot
                        </h2>
                        <p className="max-w-2xl text-base leading-7 text-default-600">
                            Check how active the library is, spot records that still need cleanup, and jump into the next archive task without leaving settings.
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    <Link href="/recordings">
                        <Button variant="secondary" className="rounded-full px-5 font-semibold">
                            Review library
                        </Button>
                    </Link>
                    <Link href="/upload">
                        <Button className="rounded-full px-5 font-semibold">
                            Upload recordings
                            <ArrowRight className="h-4 w-4" />
                        </Button>
                    </Link>
                </div>
            </div>

            <StatsGrid stats={stats} />

            <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                <Surface variant="secondary" className="rounded-[1.75rem] border border-default-200/80 p-5">
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                                Account health
                            </div>
                            <h3 className="text-xl font-bold tracking-[-0.03em] text-foreground">
                                What looks healthy, and what still needs attention
                            </h3>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-start gap-3 rounded-[1.25rem] border border-default-200/80 bg-background/80 p-4">
                                <div className="rounded-full bg-success/10 p-2 text-success">
                                    <ShieldCheck className="h-4 w-4" />
                                </div>
                                <div>
                                    <div className="font-semibold text-foreground">Account access is in a good state</div>
                                    <p className="mt-1 text-sm leading-6 text-default-500">
                                        Your workspace is active, and password or profile changes stay available from the profile section.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3 rounded-[1.25rem] border border-default-200/80 bg-background/80 p-4">
                                <div className="rounded-full bg-accent/10 p-2 text-accent">
                                    <DatabaseZap className="h-4 w-4" />
                                </div>
                                <div>
                                    <div className="font-semibold text-foreground">
                                        {summary.totalRecordings} recordings currently indexed
                                    </div>
                                    <p className="mt-1 text-sm leading-6 text-default-500">
                                        {summary.newThisMonth > 0
                                            ? `${summary.newThisMonth} new recording${summary.newThisMonth === 1 ? '' : 's'} arrived this month.`
                                            : 'No new uploads have landed this month yet.'}{' '}
                                        Average call length is {avgDurationLabel}.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3 rounded-[1.25rem] border border-default-200/80 bg-background/80 p-4">
                                <div className="rounded-full bg-warning/10 p-2 text-warning">
                                    <Sparkles className="h-4 w-4" />
                                </div>
                                <div>
                                    <div className="font-semibold text-foreground">
                                        {summary.unknownCallers} callers still need better identification
                                    </div>
                                    <p className="mt-1 text-sm leading-6 text-default-500">
                                        Cleaning these up improves search quality, contact linking, and the overall reliability of the workspace.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </Surface>

                <Surface variant="secondary" className="rounded-[1.75rem] border border-default-200/80 p-5">
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                                Next actions
                            </div>
                            <h3 className="text-xl font-bold tracking-[-0.03em] text-foreground">
                                Shortcuts for the most common library tasks
                            </h3>
                        </div>

                        <div className="space-y-3">
                            <Link
                                href="/contacts"
                                className="block rounded-[1.25rem] border border-default-200/80 bg-background/80 p-4 transition-colors hover:border-accent/20 hover:bg-accent/5"
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <div className="font-semibold text-foreground">Clean up the contact directory</div>
                                        <p className="mt-1 text-sm leading-6 text-default-500">
                                            Review companies, roles, and linked contacts to improve search and filtering.
                                        </p>
                                    </div>
                                    <ArrowRight className="h-4 w-4 text-default-300" />
                                </div>
                            </Link>

                            <Link
                                href="/upload"
                                className="block rounded-[1.25rem] border border-default-200/80 bg-background/80 p-4 transition-colors hover:border-accent/20 hover:bg-accent/5"
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <div className="font-semibold text-foreground">Bring in more recordings</div>
                                        <p className="mt-1 text-sm leading-6 text-default-500">
                                            Add fresh calls, monitor queue status, and keep the library moving forward.
                                        </p>
                                    </div>
                                    <ArrowRight className="h-4 w-4 text-default-300" />
                                </div>
                            </Link>

                            <Link
                                href="/recordings"
                                className="block rounded-[1.25rem] border border-default-200/80 bg-background/80 p-4 transition-colors hover:border-accent/20 hover:bg-accent/5"
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <div className="font-semibold text-foreground">Audit the library</div>
                                        <p className="mt-1 text-sm leading-6 text-default-500">
                                            Jump into recordings, use semantic search, and review filtered results from the main workspace.
                                        </p>
                                    </div>
                                    <ArrowRight className="h-4 w-4 text-default-300" />
                                </div>
                            </Link>
                        </div>
                    </div>
                </Surface>
            </div>
        </div>
    );
}
