'use client';

import Link from 'next/link';
import { Button, Card, Chip, Surface } from '@heroui/react';
import { ArrowRight, Rocket, Sparkles, Wrench } from 'lucide-react';

type ChangelogEntry = {
  version: string;
  date: string;
  type: string;
  summary: string;
  items: string[];
};

export function ChangelogPage({ changes }: { changes: ChangelogEntry[] }) {
  return (
    <div className="relative mx-auto max-w-5xl space-y-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(circle_at_top_left,rgba(38,132,255,0.14),transparent_34%),radial-gradient(circle_at_top_right,rgba(13,148,136,0.12),transparent_28%)]" />

      <section className="overflow-hidden rounded-[2rem] border border-default-200/80 bg-background/90 shadow-[0_24px_64px_-48px_rgba(15,23,42,0.45)]">
        <div className="grid gap-8 px-5 py-6 md:px-8 md:py-8 xl:grid-cols-[minmax(0,1.05fr)_320px] xl:items-start">
          <div className="space-y-4">
            <Chip variant="soft" color="accent" size="sm">
              Product updates
            </Chip>
            <div className="space-y-3">
              <h1 className="text-4xl font-black tracking-[-0.05em] text-foreground md:text-5xl">
                Changelog
              </h1>
              <p className="max-w-2xl text-base leading-7 text-default-600 md:text-lg">
                Track what shipped, what improved, and how the archive, transcript, and search workflow is evolving over time.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Chip variant="soft" color="success">
                {changes.length} release{changes.length === 1 ? '' : 's'} listed
              </Chip>
              <Chip variant="soft" color="default">
                Latest release: {changes[0]?.version}
              </Chip>
            </div>
          </div>

          <Surface variant="secondary" className="rounded-[1.5rem] border border-default-200/80 p-5">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-accent/10 p-3 text-accent">
                  <Rocket className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-semibold text-foreground">Release notes, not filler</div>
                  <p className="mt-1 text-sm leading-6 text-default-500">
                    This page is where we call out meaningful shipped work so customers can understand product movement clearly.
                  </p>
                </div>
              </div>
              <Link href="/support">
                <Button variant="secondary" className="w-full rounded-full font-semibold">
                  Ask about a release
                </Button>
              </Link>
            </div>
          </Surface>
        </div>
      </section>

      <div className="space-y-5">
        {changes.map((change) => (
          <Card
            key={change.version}
            className="rounded-[2rem] border border-default-200/80 bg-background/95 shadow-[0_20px_54px_-44px_rgba(15,23,42,0.45)]"
          >
            <Card.Content className="space-y-6 p-6 md:p-7">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-2xl font-semibold tracking-[-0.03em] text-foreground">
                      {change.version}
                    </div>
                    <Chip size="sm" color="accent" variant="soft">
                      {change.type}
                    </Chip>
                    <Chip size="sm" color="default" variant="soft">
                      {change.date}
                    </Chip>
                  </div>
                  <p className="max-w-2xl text-sm leading-6 text-default-500">{change.summary}</p>
                </div>

                <Surface variant="secondary" className="rounded-xl border border-default-200/80 p-4 md:max-w-[260px]">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                      <Sparkles className="h-3.5 w-3.5" />
                      Release scope
                    </div>
                    <div className="text-sm leading-6 text-default-500">
                      {change.items.length} major capability update{change.items.length === 1 ? '' : 's'} in this release.
                    </div>
                  </div>
                </Surface>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {change.items.map((item) => (
                  <Surface
                    key={item}
                    variant="secondary"
                    className="rounded-xl border border-default-200/80 p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="rounded-full bg-accent/10 p-2 text-accent">
                        <Wrench className="h-4 w-4" />
                      </div>
                      <div className="text-sm leading-6 text-default-600">{item}</div>
                    </div>
                  </Surface>
                ))}
              </div>
            </Card.Content>
          </Card>
        ))}
      </div>

      <Card className="rounded-[2rem] border border-default-200/80 bg-background/95 shadow-[0_20px_54px_-44px_rgba(15,23,42,0.45)]">
        <Card.Content className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between md:p-7">
          <div>
            <div className="text-xl font-bold tracking-[-0.03em] text-foreground">Need context on a specific change?</div>
            <p className="mt-2 text-sm leading-6 text-default-500">
              Reach out if you want rollout details, upgrade implications, or confirmation about what changed in your workflow.
            </p>
          </div>
          <Link href="/support">
            <Button className="rounded-full px-6 font-semibold">
              Contact support
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </Card.Content>
      </Card>
    </div>
  );
}
