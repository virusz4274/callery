'use client';

import { ActionLink } from '@/components/action-link';
import { Card, Chip, Link, Surface } from '@heroui/react';
import { ArrowRight, FileText, ShieldCheck } from 'lucide-react';

type LegalDocumentPageProps = {
  title: string;
  sections: {
    title: string;
    content: string[];
  }[];
  lastUpdated: string;
};

export function LegalDocumentPage({ title, sections, lastUpdated }: LegalDocumentPageProps) {
    return (
        <div className="relative mx-auto max-w-5xl space-y-8">


            <Card className="overflow-hidden">
                <Card.Content className="grid gap-8 xl:grid-cols-[minmax(0,1.05fr)_320px] xl:items-start">
                    <div className="space-y-4">
                        <Chip variant="soft" color="accent" size="sm">
                            Legal
                        </Chip>
                        <div className="space-y-3">
                            <h1 className="text-2xl font-semibold text-foreground md:text-3xl">
                                {title}
                            </h1>
                            <p className="max-w-2xl text-base leading-7 text-muted md:text-lg">
                                Clear product terms and policy language for using the workspace, uploading recordings, and understanding how data is handled.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Chip variant="soft" color="default">
                                Last updated: {lastUpdated}
                            </Chip>
                            <Chip variant="soft" color="success">
                                {sections.length} sections
                            </Chip>
                        </div>
                    </div>

                    <div className="grid gap-3">
                        <Surface variant="secondary" className="p-4">
                            <div className="flex items-start gap-3">
                                <div className="rounded-2xl bg-accent/10 p-3 text-accent">
                                    <FileText className="h-5 w-5" />
                                </div>
                                <div>
                                    <div className="font-semibold text-foreground">Readable structure</div>
                                    <p className="mt-1 text-sm leading-6 text-muted">
                                        Each section is broken into short, scan-friendly blocks instead of one dense legal wall.
                                    </p>
                                </div>
                            </div>
                        </Surface>
                        <Surface variant="secondary" className="p-4">
                            <div className="flex items-start gap-3">
                                <div className="rounded-2xl bg-success/10 p-3 text-success">
                                    <ShieldCheck className="h-5 w-5" />
                                </div>
                                <div>
                                    <div className="font-semibold text-foreground">Questions about policy?</div>
                                    <p className="mt-1 text-sm leading-6 text-muted">
                                        If any clause impacts your workflow or compliance review, support can clarify intent.
                                    </p>
                                </div>
                            </div>
                            <ActionLink href="/support" variant="secondary" className="w-full font-semibold">
                                    Contact support
                                    <ArrowRight className="h-4 w-4" />
                                </ActionLink>
                        </Surface>
                    </div>
                </Card.Content>
            </Card>

            <div className="grid gap-6 xl:grid-cols-[240px_minmax(0,1fr)]">
                <Card className="xl:sticky xl:top-6">
                    <Card.Content className="space-y-3 p-5">
                        <div className="text-xs font-semibold uppercase text-muted">
                            On this page
                        </div>
                        <div className="space-y-2">
                            {sections.map((section, index) => (
                                <Link
                                    key={section.title}
                                    href={`#legal-section-${index + 1}`}
                                    className="flex min-h-11 text-sm"
                                >
                                    {section.title}
                                </Link>
                            ))}
                        </div>
                    </Card.Content>
                </Card>

                <Card>
                    <Card.Content className="space-y-5 p-6 md:p-8">
                        {sections.map((section, index) => (
                            <Surface variant="secondary"
                                key={section.title}
                                id={`legal-section-${index + 1}`}
                                className="p-5"
                            >
                                <div className="mb-4 flex items-center gap-3">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 text-sm font-semibold text-accent">
                                        {index + 1}
                                    </div>
                                    <h2 className="text-2xl font-bold text-foreground">
                                        {section.title}
                                    </h2>
                                </div>
                                <div className="space-y-4">
                                    {section.content.map((paragraph, paragraphIndex) => (
                                        <p key={paragraphIndex} className="text-sm leading-7 text-muted md:text-base">
                                            {paragraph}
                                        </p>
                                    ))}
                                </div>
                            </Surface>
                        ))}
                    </Card.Content>
                </Card>
            </div>
        </div>
    );
}
