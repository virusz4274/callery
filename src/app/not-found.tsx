import Link from 'next/link';
import { Button, Card, Chip } from '@heroui/react';
import { ArrowRight, Compass, SearchX } from 'lucide-react';

export default function NotFound() {
    return (
        <div className="relative min-h-[calc(100vh-120px)] overflow-hidden px-4 py-10 sm:px-6 lg:px-8">
            <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(circle_at_top_left,rgba(38,132,255,0.14),transparent_30%),radial-gradient(circle_at_top_right,rgba(13,148,136,0.12),transparent_26%)]" />
            <div className="mx-auto max-w-5xl">
                <Card className="overflow-hidden rounded-[2rem] border border-default-200/80 bg-background/92 shadow-[0_24px_64px_-48px_rgba(15,23,42,0.45)]">
                    <div className="grid gap-8 px-6 py-8 md:px-8 md:py-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
                        <div className="space-y-5">
                            <div className="flex flex-wrap items-center gap-2">
                                <Chip variant="soft" color="default">404</Chip>
                                <Chip variant="soft" color="accent">Route not found</Chip>
                            </div>
                            <div className="space-y-3">
                                <h1 className="text-4xl font-black tracking-[-0.05em] text-foreground md:text-5xl">
                                    This page is no longer here.
                                </h1>
                                <p className="max-w-2xl text-base leading-7 text-default-600 md:text-lg">
                                    The link may be outdated, the route may have moved, or the page never existed in this environment.
                                </p>
                            </div>
                            <div className="flex flex-col gap-3 sm:flex-row">
                                <Link href="/">
                                    <Button className="w-full rounded-full px-6 font-semibold sm:w-auto">
                                        Go to homepage
                                        <ArrowRight className="h-4 w-4" />
                                    </Button>
                                </Link>
                                <Link href="/recordings">
                                    <Button variant="secondary" className="w-full rounded-full px-6 font-semibold sm:w-auto">
                                        Open recordings
                                    </Button>
                                </Link>
                            </div>
                        </div>

                        <div className="grid gap-3">
                            <div className="rounded-[1.5rem] border border-default-200/80 bg-default-50/70 p-5">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                        <SearchX className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-foreground">Check the URL</p>
                                        <p className="text-sm leading-6 text-default-500">Typos and outdated shared links are the most common reason this page shows up.</p>
                                    </div>
                                </div>
                            </div>
                            <div className="rounded-[1.5rem] border border-default-200/80 bg-default-50/70 p-5">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                        <Compass className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-foreground">Use the main workspace</p>
                                        <p className="text-sm leading-6 text-default-500">If you were expecting call data, jump back to recordings or contacts and navigate from there.</p>
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
