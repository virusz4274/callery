'use client';

import Link from 'next/link';
import { Button, Card, Chip, Surface } from '@heroui/react';
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
            <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(circle_at_top_left,rgba(38,132,255,0.14),transparent_34%),radial-gradient(circle_at_top_right,rgba(13,148,136,0.12),transparent_28%)]" />

            <section className="overflow-hidden rounded-[2rem] border border-default-200/80 bg-background/90 shadow-[0_24px_64px_-48px_rgba(15,23,42,0.45)]">
                <div className="grid gap-8 px-5 py-6 md:px-8 md:py-8 xl:grid-cols-[minmax(0,1.05fr)_320px] xl:items-start">
                    <div className="space-y-4">
                        <Chip variant="soft" color="accent" size="sm">
                            Legal
                        </Chip>
                        <div className="space-y-3">
                            <h1 className="text-4xl font-black tracking-[-0.05em] text-foreground md:text-5xl">
                                {title}
                            </h1>
                            <p className="max-w-2xl text-base leading-7 text-default-600 md:text-lg">
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
                        <Surface variant="secondary" className="rounded-[1.5rem] border border-default-200/80 p-4">
                            <div className="flex items-start gap-3">
                                <div className="rounded-2xl bg-accent/10 p-3 text-accent">
                                    <FileText className="h-5 w-5" />
                                </div>
                                <div>
                                    <div className="font-semibold text-foreground">Readable structure</div>
                                    <p className="mt-1 text-sm leading-6 text-default-500">
                                        Each section is broken into short, scan-friendly blocks instead of one dense legal wall.
                                    </p>
                                </div>
                            </div>
                        </Surface>
                        <Surface variant="secondary" className="rounded-[1.5rem] border border-default-200/80 p-4">
                            <div className="flex items-start gap-3">
                                <div className="rounded-2xl bg-success/10 p-3 text-success">
                                    <ShieldCheck className="h-5 w-5" />
                                </div>
                                <div>
                                    <div className="font-semibold text-foreground">Questions about policy?</div>
                                    <p className="mt-1 text-sm leading-6 text-default-500">
                                        If any clause impacts your workflow or compliance review, support can clarify intent.
                                    </p>
                                </div>
                            </div>
                            <Link href="/support" className="mt-4 block">
                                <Button variant="secondary" className="w-full rounded-full font-semibold">
                                    Contact support
                                    <ArrowRight className="h-4 w-4" />
                                </Button>
                            </Link>
                        </Surface>
                    </div>
                </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[240px_minmax(0,1fr)]">
                <Card className="rounded-[2rem] border border-default-200/80 bg-background/95 shadow-[0_20px_54px_-44px_rgba(15,23,42,0.45)] xl:sticky xl:top-6">
                    <Card.Content className="space-y-3 p-5">
                        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                            On this page
                        </div>
                        <div className="space-y-2">
                            {sections.map((section, index) => (
                                <a
                                    key={section.title}
                                    href={`#legal-section-${index + 1}`}
                                    className="block rounded-xl border border-default-200/80 bg-default-50/70 px-4 py-3 text-sm text-default-600 transition-colors hover:border-accent/20 hover:bg-accent/5 hover:text-foreground"
                                >
                                    {section.title}
                                </a>
                            ))}
                        </div>
                    </Card.Content>
                </Card>

                <Card className="rounded-[2rem] border border-default-200/80 bg-background/95 shadow-[0_20px_54px_-44px_rgba(15,23,42,0.45)]">
                    <Card.Content className="space-y-5 p-6 md:p-8">
                        {sections.map((section, index) => (
                            <section
                                key={section.title}
                                id={`legal-section-${index + 1}`}
                                className="rounded-[1.5rem] border border-default-200/80 bg-default-50/40 p-5"
                            >
                                <div className="mb-4 flex items-center gap-3">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 text-sm font-semibold text-accent">
                                        {index + 1}
                                    </div>
                                    <h2 className="text-2xl font-bold tracking-[-0.03em] text-foreground">
                                        {section.title}
                                    </h2>
                                </div>
                                <div className="space-y-4">
                                    {section.content.map((paragraph, paragraphIndex) => (
                                        <p key={paragraphIndex} className="text-sm leading-7 text-default-600 md:text-base">
                                            {paragraph}
                                        </p>
                                    ))}
                                </div>
                            </section>
                        ))}
                    </Card.Content>
                </Card>
            </div>
        </div>
    );
}
