'use client';

import React from 'react';
import { Skeleton } from '@heroui/react';

export function SettingsLoadingState() {
    return (
        <div className="w-full p-6 space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
                <p className="text-default-500">Manage your account preferences and application settings.</p>
            </div>
            <div className="flex flex-col lg:flex-row gap-6">
                <div className="w-full lg:w-64 space-y-2">
                    {[1, 2, 3, 4].map((index) => (
                        <Skeleton key={index} className="h-10 w-full rounded-lg" />
                    ))}
                </div>
                <div className="flex-1">
                    <Skeleton className="h-[500px] w-full rounded-2xl" />
                </div>
            </div>
        </div>
    );
}
