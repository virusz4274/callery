'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card } from '@heroui/react';
import { ArrowLeft } from 'lucide-react';
import { Logo } from '@/components/icons';
import { publicSitePolicy } from '@/lib/public-site-policy';

type AuthShellProps = {
    badge?: string;
    title: string;
    description?: string;
    children: ReactNode;
    footer?: ReactNode;
    compactOnMobile?: boolean;
};

export function AuthShell({ title, description, children, footer }: AuthShellProps) {
    return (
        <div className="min-h-dvh bg-background text-foreground">
            <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-4 sm:px-6 lg:px-8">
                <div className="flex min-h-20 flex-wrap items-center justify-between gap-2 py-3">
                    <Link href="/" className="inline-flex min-h-11 items-center gap-2.5 text-lg font-semibold tracking-tight">
                        <Logo className="size-7" />Callery
                    </Link>
                    {publicSitePolicy().marketingEnabled && <Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-muted transition-colors hover:text-foreground">
                        <ArrowLeft className="size-4" aria-hidden="true" />Back to site
                    </Link>}
                </div>
                <main className="flex flex-1 items-start justify-center py-6 md:py-12">
                    <Card className="w-full max-w-md gap-0 rounded-2xl border border-border bg-surface p-0 shadow-surface">
                        <Card.Header className="gap-2 px-5 pt-6 sm:px-8 sm:pt-8">
                            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
                            {description && <p className="text-sm leading-6 text-muted">{description}</p>}
                        </Card.Header>
                        <Card.Content className="px-5 py-6 sm:px-8">{children}</Card.Content>
                        {footer && <Card.Footer className="border-t border-border px-5 py-5 sm:px-8">{footer}</Card.Footer>}
                    </Card>
                </main>
            </div>
        </div>
    );
}
