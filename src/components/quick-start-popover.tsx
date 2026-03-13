'use client';

import Link from 'next/link';
import React from 'react';
import { Button, Popover } from '@heroui/react';
import { ExternalLink, PlayCircle } from 'lucide-react';

type QuickStartStep = {
    title: string;
    description: string;
    href?: string;
};

type QuickStartPopoverProps = {
    title: string;
    description: string;
    steps: QuickStartStep[];
};

export function QuickStartPopover({
    title,
    description,
    steps,
}: QuickStartPopoverProps) {
    return (
        <Popover>
            <Popover.Trigger>
                <Button variant="ghost" className="rounded-full px-4 font-medium">
                    <PlayCircle className="h-4 w-4" />
                    Quick start
                </Button>
            </Popover.Trigger>
            <Popover.Content placement="bottom" offset={10} className="w-[min(92vw,26rem)]">
                <Popover.Dialog className="p-4">
                    <Popover.Arrow />
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <Popover.Heading className="text-base font-semibold text-foreground">
                                {title}
                            </Popover.Heading>
                            <p className="text-sm leading-6 text-default-600">{description}</p>
                        </div>

                        <div className="space-y-3">
                            {steps.map((step, index) => (
                                <div
                                    key={step.title}
                                    className="rounded-[1rem] border border-default-200/80 bg-default-50/70 p-3"
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                            {index + 1}
                                        </div>
                                        <div className="min-w-0 space-y-1">
                                            <div className="text-sm font-semibold text-foreground">
                                                {step.title}
                                            </div>
                                            <p className="text-sm leading-6 text-default-500">
                                                {step.description}
                                            </p>
                                            {step.href && (
                                                <Link
                                                    href={step.href}
                                                    className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80"
                                                >
                                                    Open
                                                    <ExternalLink className="h-3.5 w-3.5" />
                                                </Link>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <p className="text-xs leading-5 text-default-400">
                            When you add a short setup video later, this quick-start entry point can open it too.
                        </p>
                    </div>
                </Popover.Dialog>
            </Popover.Content>
        </Popover>
    );
}
