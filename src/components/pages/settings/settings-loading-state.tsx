'use client';

import { Chip, Skeleton } from '@heroui/react';

export function SettingsLoadingState() {
    return (
        <div className="space-y-8 px-4 py-6 sm:px-6 lg:px-8">
            <div className="overflow-hidden rounded-[2rem] border border-default-200/80 bg-background/95 p-6 shadow-[0_20px_54px_-44px_rgba(15,23,42,0.45)] sm:p-8">
                <div className="space-y-5">
                    <div className="flex flex-wrap gap-2">
                        <Chip variant="soft" color="default" size="sm">
                            Settings workspace
                        </Chip>
                        <Chip variant="soft" color="accent" size="sm">
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
                            <Skeleton key={item} className="h-20 rounded-xl" />
                        ))}
                    </div>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
                <div className="overflow-hidden rounded-[2rem] border border-default-200/80 bg-background/95 p-4 shadow-[0_20px_54px_-44px_rgba(15,23,42,0.45)]">
                    <div className="space-y-3">
                        {[1, 2, 3, 4, 5, 6].map((item) => (
                            <Skeleton key={item} className="h-14 rounded-xl" />
                        ))}
                    </div>
                </div>
                <div className="overflow-hidden rounded-[2rem] border border-default-200/80 bg-background/95 p-6 shadow-[0_20px_54px_-44px_rgba(15,23,42,0.45)]">
                    <div className="space-y-5">
                        <Skeleton className="h-8 w-48 rounded-xl" />
                        <Skeleton className="h-4 w-full max-w-2xl rounded-xl" />
                        <div className="grid gap-4 md:grid-cols-2">
                            <Skeleton className="h-44 rounded-xl" />
                            <Skeleton className="h-44 rounded-xl" />
                        </div>
                        <Skeleton className="h-56 rounded-xl" />
                    </div>
                </div>
            </div>
        </div>
    );
}
