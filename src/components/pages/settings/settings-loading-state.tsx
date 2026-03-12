'use client';

import React from 'react';
import { Chip, Skeleton } from '@heroui/react';

export function SettingsLoadingState() {
    return (
        <div className="space-y-8 px-4 py-6 sm:px-6 lg:px-8">
            <div className="overflow-hidden rounded-[2rem] border border-default-200/80 bg-background/95 p-6 shadow-[0_24px_64px_-48px_rgba(15,23,42,0.45)] sm:p-8">
                <div className="space-y-5">
                    <div className="flex flex-wrap gap-2">
                        <Chip variant="soft" color="default" className="rounded-full px-3 py-1 text-[11px] font-semibold">
                            Settings workspace
                        </Chip>
                        <Chip variant="soft" color="accent" className="rounded-full px-3 py-1 text-[11px] font-semibold">
                            Loading
                        </Chip>
                    </div>
                    <div className="space-y-3">
                        <Skeleton className="h-10 w-52 rounded-xl" />
                        <Skeleton className="h-4 w-full max-w-2xl rounded-xl" />
                        <Skeleton className="h-4 w-full max-w-xl rounded-xl" />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                        {[1, 2, 3].map((item) => (
                            <Skeleton key={item} className="h-20 rounded-[1.4rem]" />
                        ))}
                    </div>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
                <div className="overflow-hidden rounded-[1.8rem] border border-default-200/80 bg-background/95 p-4 shadow-[0_20px_56px_-44px_rgba(15,23,42,0.45)]">
                    <div className="space-y-3">
                        {[1, 2, 3, 4, 5, 6].map((item) => (
                            <Skeleton key={item} className="h-14 rounded-[1.1rem]" />
                        ))}
                    </div>
                </div>
                <div className="overflow-hidden rounded-[1.8rem] border border-default-200/80 bg-background/95 p-6 shadow-[0_20px_56px_-44px_rgba(15,23,42,0.45)]">
                    <div className="space-y-5">
                        <Skeleton className="h-8 w-48 rounded-xl" />
                        <Skeleton className="h-4 w-full max-w-2xl rounded-xl" />
                        <div className="grid gap-4 md:grid-cols-2">
                            <Skeleton className="h-44 rounded-[1.25rem]" />
                            <Skeleton className="h-44 rounded-[1.25rem]" />
                        </div>
                        <Skeleton className="h-56 rounded-[1.4rem]" />
                    </div>
                </div>
            </div>
        </div>
    );
}
