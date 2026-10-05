'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button, Chip } from '@heroui/react';
import { Library, RefreshCw, WifiOff } from 'lucide-react';
import { Logo } from '@/components/icons';

export default function OfflinePage() {
    const [isOnline, setIsOnline] = useState(true);

    useEffect(() => {
        const updateOnlineStatus = () => {
            setIsOnline(window.navigator.onLine);
        };

        updateOnlineStatus();
        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);

        return () => {
            window.removeEventListener('online', updateOnlineStatus);
            window.removeEventListener('offline', updateOnlineStatus);
        };
    }, []);

    return (
        <div className="relative min-h-dvh overflow-hidden bg-background px-4 py-8 text-foreground sm:px-6 lg:px-8">
            <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[540px] bg-[radial-gradient(circle_at_top_left,rgba(38,132,255,0.16),transparent_34%),radial-gradient(circle_at_top_right,rgba(13,148,136,0.14),transparent_30%)]" />

            <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-5xl items-center">
                <div className="w-full overflow-hidden rounded-[2rem] border border-default-200/80 bg-background/92 shadow-[0_28px_72px_-52px_rgba(15,23,42,0.45)] backdrop-blur">
                    <div className="grid gap-8 px-6 py-8 md:px-8 md:py-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
                        <div className="space-y-6">
                            <div className="flex items-center gap-3">
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-default-200 bg-default-50 text-primary shadow-sm">
                                    <Logo className="h-6 w-6" />
                                </div>
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-default-500">
                                        Callery
                                    </p>
                                    <p className="text-sm text-default-500">
                                        Offline workspace fallback
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Chip
                                        color={isOnline ? 'success' : 'warning'}
                                        variant="soft"
                                        className="rounded-full px-3 py-1 text-xs font-medium"
                                    >
                                        {isOnline ? 'Connection restored' : 'No internet connection'}
                                    </Chip>
                                    <Chip variant="soft" className="rounded-full px-3 py-1 text-xs font-medium">
                                        PWA offline page
                                    </Chip>
                                </div>

                                <h1 className="max-w-3xl text-4xl font-black tracking-[-0.05em] text-foreground md:text-5xl">
                                    You are offline, but the app is still here.
                                </h1>
                                <p className="max-w-2xl text-base leading-7 text-default-600 md:text-lg">
                                    Callery could not reach the network for this page. Your installed app shell is still
                                    available, and you can jump back in as soon as your connection returns.
                                </p>
                            </div>

                            <div className="flex flex-col gap-3 sm:flex-row">
                                <Button onPress={() => window.location.reload()} className="h-12 rounded-full px-6 text-sm font-semibold">
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Try again
                                </Button>
                                <Link
                                    href="/"
                                    className="inline-flex h-12 items-center justify-center rounded-full border border-default-200 bg-default-50 px-6 text-sm font-semibold text-foreground transition-colors hover:bg-default-100"
                                >
                                    Return home
                                </Link>
                            </div>
                        </div>

                        <div className="grid gap-3">
                            <div className="rounded-[1.5rem] border border-default-200/80 bg-default-50/75 p-5">
                                <div className="flex items-start gap-3">
                                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                        <WifiOff className="h-5 w-5" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-sm font-semibold text-foreground">Why this page showed up</p>
                                        <p className="text-sm leading-6 text-default-500">
                                            The page you requested needed the network and was not safe to serve from cache.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-[1.5rem] border border-default-200/80 bg-default-50/75 p-5">
                                <div className="flex items-start gap-3">
                                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                        <Library className="h-5 w-5" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-sm font-semibold text-foreground">What to do next</p>
                                        <p className="text-sm leading-6 text-default-500">
                                            Reconnect and retry, or return to the homepage and relaunch the part of the workspace you need.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-[1.5rem] border border-dashed border-default-200/80 bg-background/80 p-5">
                                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-default-400">
                                    PWA safety
                                </p>
                                <p className="mt-2 text-sm leading-6 text-default-500">
                                    Private account APIs are intentionally not cached offline, so this fallback protects you from
                                    stale or cross-account data.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
