import { Card, Chip, Surface } from '@heroui/react';
import { ActionLink } from '@/components/action-link';
import { ArrowRight, Compass, SearchX } from 'lucide-react';

export default function NotFound() {
    return (
        <div className="relative min-h-[calc(100vh-120px)] overflow-hidden px-4 py-10 sm:px-6 lg:px-8">

            <div className="mx-auto max-w-5xl">
                <Card className="overflow-hidden">
                    <Card.Content className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
                        <div className="space-y-5">
                            <div className="flex flex-wrap items-center gap-2">
                                <Chip variant="soft">
                                    404
                                </Chip>
                                <Chip variant="soft" color="accent">
                                    Route not found
                                </Chip>
                            </div>
                            <div className="space-y-3">
                                <h1 className="text-2xl font-semibold text-foreground md:text-3xl">
                                    This page is no longer here.
                                </h1>
                                <p className="max-w-2xl text-base leading-7 text-muted md:text-lg">
                                    The link may be outdated, the route may have moved, or the page never existed in this environment.
                                </p>
                            </div>
                            <div className="flex flex-col gap-3 sm:flex-row">
                                <ActionLink
                                    href="/"
                                    className="min-h-11 w-full sm:w-auto"
                                >
                                    Go to homepage
                                    <ArrowRight className="h-4 w-4" />
                                </ActionLink>
                                <ActionLink variant="secondary"
                                    href="/recordings"
                                    className="min-h-11 w-full sm:w-auto"
                                >
                                    Open recordings
                                </ActionLink>
                            </div>
                        </div>

                        <div className="grid gap-3">
                            <Surface variant="secondary" className="p-5">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                        <SearchX className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-foreground">Check the URL</p>
                                        <p className="text-sm leading-6 text-muted">Typos and outdated shared links are the most common reason this page shows up.</p>
                                    </div>
                                </div>
                            </Surface>
                            <Surface variant="secondary" className="p-5">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                        <Compass className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-foreground">Use the main workspace</p>
                                        <p className="text-sm leading-6 text-muted">If you were expecting call data, jump back to recordings or contacts and navigate from there.</p>
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
