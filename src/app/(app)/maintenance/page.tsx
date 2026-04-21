'use client';

import { Button, Card, Chip } from '@heroui/react';
import { Clock3, OctagonAlert, Wrench } from 'lucide-react';

export default function MaintenancePage() {
    return (
        <div className="relative min-h-screen overflow-hidden px-4 py-10 sm:px-6 lg:px-8">
            <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[460px] bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.16),transparent_28%),radial-gradient(circle_at_top_right,rgba(38,132,255,0.12),transparent_24%)]" />
            <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center justify-center">
                <Card className="w-full overflow-hidden rounded-[2rem] border border-default-200/80 bg-background/92 shadow-[0_24px_64px_-48px_rgba(15,23,42,0.45)]">
                    <div className="grid gap-8 px-6 py-8 md:px-8 md:py-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
                        <div className="space-y-5">
                            <div className="flex flex-wrap items-center gap-2">
                                <Chip variant="soft" color="warning">Scheduled maintenance</Chip>
                                <Chip variant="soft" color="default">Temporary pause</Chip>
                            </div>
                            <div className="space-y-3">
                                <h1 className="text-4xl font-black tracking-[-0.05em] text-foreground md:text-5xl">
                                    We are improving the workspace right now.
                                </h1>
                                <p className="max-w-2xl text-base leading-7 text-default-600 md:text-lg">
                                    The application is temporarily unavailable while maintenance is in progress. We will bring it back as soon as the update is complete.
                                </p>
                            </div>
                            <Button variant="secondary" className="rounded-full px-6 font-semibold" isDisabled>
                                Check back shortly
                            </Button>
                        </div>

                        <div className="grid gap-3">
                            <div className="rounded-[1.5rem] border border-default-200/80 bg-default-50/70 p-5">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-warning/10 text-warning">
                                        <OctagonAlert className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-foreground">Status</p>
                                        <p className="text-sm leading-6 text-default-500">We are in a controlled maintenance window, not an unknown outage.</p>
                                    </div>
                                </div>
                            </div>
                            <div className="rounded-[1.5rem] border border-default-200/80 bg-default-50/70 p-5">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                        <Wrench className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-foreground">What is happening</p>
                                        <p className="text-sm leading-6 text-default-500">Infrastructure and product updates are being applied so the app returns in a healthier state.</p>
                                    </div>
                                </div>
                            </div>
                            <div className="rounded-[1.5rem] border border-default-200/80 bg-default-50/70 p-5">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                        <Clock3 className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-foreground">Expectation</p>
                                        <p className="text-sm leading-6 text-default-500">Please retry in a bit. No action is needed on your side while the work completes.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
}
