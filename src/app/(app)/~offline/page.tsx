'use client';

import { ActionLink } from '@/components/action-link';
import { useEffect, useState } from 'react';
import { Button, Chip, Card, Surface } from '@heroui/react';
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


            <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-5xl items-center">
                <Card className="w-full overflow-hidden">
                    <Card.Content className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
                        <div className="space-y-6">
                            <div className="flex items-center gap-3">
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-default-50 text-primary shadow-sm">
                                    <Logo className="h-6 w-6" />
                                </div>
                                <div>
                                    <p className="text-xs font-semibold uppercase text-muted">
                                        Callery
                                    </p>
                                    <p className="text-sm text-muted">
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

                                <h1 className="max-w-3xl text-2xl font-semibold text-foreground md:text-3xl">
                                    You are offline, but the app is still here.
                                </h1>
                                <p className="max-w-2xl text-base leading-7 text-muted md:text-lg">
                                    Callery could not reach the network for this page. Your installed app shell is still
                                    available, and you can jump back in as soon as your connection returns.
                                </p>
                            </div>

                            <div className="flex flex-col gap-3 sm:flex-row">
                                <Button onPress={() => window.location.reload()} className="h-12 px-6 text-sm font-semibold">
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Try again
                                </Button>
                                <ActionLink variant="secondary"
                                    href="/"
                                    className="min-h-11"
                                >
                                    Return home
                                </ActionLink>
                            </div>
                        </div>

                        <div className="grid gap-3">
                            <Surface variant="secondary" className="p-5">
                                <div className="flex items-start gap-3">
                                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                        <WifiOff className="h-5 w-5" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-sm font-semibold text-foreground">Why this page showed up</p>
                                        <p className="text-sm leading-6 text-muted">
                                            The page you requested needed the network and was not safe to serve from cache.
                                        </p>
                                    </div>
                                </div>
                            </Surface>

                            <Surface variant="secondary" className="p-5">
                                <div className="flex items-start gap-3">
                                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                        <Library className="h-5 w-5" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-sm font-semibold text-foreground">What to do next</p>
                                        <p className="text-sm leading-6 text-muted">
                                            Reconnect and retry, or return to the homepage and relaunch the part of the workspace you need.
                                        </p>
                                    </div>
                                </div>
                            </Surface>

                            <Surface variant="secondary" className="border-dashed p-5">
                                <p className="text-xs font-semibold uppercase text-muted">
                                    PWA safety
                                </p>
                                <p className="mt-2 text-sm leading-6 text-muted">
                                    Private account APIs are intentionally not cached offline, so this fallback protects you from
                                    stale or cross-account data.
                                </p>
                            </Surface>
                        </div>
                    </Card.Content>
                </Card>
            </div>
        </div>
    );
}
