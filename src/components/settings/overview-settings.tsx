'use client';

import Link from 'next/link';
import { Skeleton } from '@heroui/react';
import { ArrowRight } from 'lucide-react';
import { StatsGrid } from './stats-grid';
import { useStats } from '@/hooks/use-stats';

export function OverviewSettings() {
    const { stats, isLoading, error } = useStats();
    if (isLoading) return <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Loading statistics">
        {[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-28 rounded-xl" />)}
    </div>;
    if (error) return <p role="alert" className="rounded-xl border border-danger/20 p-4 text-danger">Could not load statistics: {error.message}</p>;
    return (
        <div className="space-y-6">
            <StatsGrid stats={stats} />
            <section className="space-y-3">
                <h2 className="text-base font-semibold">Shortcuts</h2>
                <div className="grid gap-2 sm:grid-cols-3">
                    {[{ href: '/recordings', label: 'Recordings' }, { href: '/contacts', label: 'Contacts' }, { href: '/upload', label: 'Upload recordings' }].map(({ href, label }) =>
                        <Link key={href} href={href} className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-border px-3 py-3 text-sm font-medium transition-colors hover:bg-surface-secondary">
                            {label}<ArrowRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
                        </Link>)}
                </div>
            </section>
        </div>
    );
}
