'use client';

import { Button, Card, Chip, Surface } from '@heroui/react';
import { Clock3, OctagonAlert, Wrench } from 'lucide-react';

export default function MaintenancePage() {
    return (
        <div className="relative min-h-screen overflow-hidden px-4 py-10 sm:px-6 lg:px-8">

            <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center justify-center">
                <Card className="w-full overflow-hidden">
                    <Card.Content className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
                        <div className="space-y-5">
                            <div className="flex flex-wrap items-center gap-2">
                                <Chip variant="soft" color="warning">Scheduled maintenance</Chip>
                                <Chip variant="soft" color="default">Temporary pause</Chip>
                            </div>
                            <div className="space-y-3">
                                <h1 className="text-2xl font-semibold text-foreground md:text-3xl">
                                    We are improving the workspace right now.
                                </h1>
                                <p className="max-w-2xl text-base leading-7 text-muted md:text-lg">
                                    The application is temporarily unavailable while maintenance is in progress. We will bring it back as soon as the update is complete.
                                </p>
                            </div>
                            <Button variant="secondary" className="px-6 font-semibold" isDisabled>
                                Check back shortly
                            </Button>
                        </div>

                        <div className="grid gap-3">
                            <Surface variant="secondary" className="p-5">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-warning/10 text-warning">
                                        <OctagonAlert className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-foreground">Status</p>
                                        <p className="text-sm leading-6 text-muted">We are in a controlled maintenance window, not an unknown outage.</p>
                                    </div>
                                </div>
                            </Surface>
                            <Surface variant="secondary" className="p-5">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                        <Wrench className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-foreground">What is happening</p>
                                        <p className="text-sm leading-6 text-muted">Infrastructure and product updates are being applied so the app returns in a healthier state.</p>
                                    </div>
                                </div>
                            </Surface>
                            <Surface variant="secondary" className="p-5">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                        <Clock3 className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-foreground">Expectation</p>
                                        <p className="text-sm leading-6 text-muted">Please retry in a bit. No action is needed on your side while the work completes.</p>
                                    </div>
                                </div>
                            </Surface>
                        </div>
                    </Card.Content>
                </Card>
            </div>
        </div>
    );
}
