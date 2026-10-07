'use client';

import { ActionLink } from '@/components/action-link';
import { Card, Chip, Surface } from '@heroui/react';
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


      <Card className="overflow-hidden">
        <Card.Content className="grid gap-8 xl:grid-cols-[minmax(0,1.05fr)_320px] xl:items-start">
          <div className="space-y-4">
            <Chip variant="soft" color="accent" size="sm">
              Product updates
            </Chip>
            <div className="space-y-3">
              <h1 className="text-2xl font-semibold text-foreground md:text-3xl">
                Changelog
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted md:text-lg">
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

          <Surface variant="secondary" className="p-5">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-accent/10 p-3 text-accent">
                  <Rocket className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-semibold text-foreground">Release notes, not filler</div>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    This page is where we call out meaningful shipped work so customers can understand product movement clearly.
                  </p>
                </div>
              </div>
              <ActionLink href="/support" variant="secondary" className="w-full font-semibold">
                  Ask about a release
                </ActionLink>
            </div>
          </Surface>
        </Card.Content>
      </Card>

      <div className="space-y-5">
        {changes.map((change) => (
          <Card
            key={change.version}

          >
            <Card.Content className="space-y-6 p-6 md:p-7">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-2xl font-semibold text-foreground">
                      {change.version}
                    </div>
                    <Chip size="sm" color="accent" variant="soft">
                      {change.type}
                    </Chip>
                    <Chip size="sm" color="default" variant="soft">
                      {change.date}
                    </Chip>
                  </div>
                  <p className="max-w-2xl text-sm leading-6 text-muted">{change.summary}</p>
                </div>

                <Surface variant="secondary" className="p-4 md:max-w-[260px]">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted">
                      <Sparkles className="h-3.5 w-3.5" />
                      Release scope
                    </div>
                    <div className="text-sm leading-6 text-muted">
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
                    className="p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="rounded-full bg-accent/10 p-2 text-accent">
                        <Wrench className="h-4 w-4" />
                      </div>
                      <div className="text-sm leading-6 text-muted">{item}</div>
                    </div>
                  </Surface>
                ))}
              </div>
            </Card.Content>
          </Card>
        ))}
      </div>

      <Card>
        <Card.Content className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between md:p-7">
          <div>
            <div className="text-xl font-bold text-foreground">Need context on a specific change?</div>
            <p className="mt-2 text-sm leading-6 text-muted">
              Reach out if you want rollout details, upgrade implications, or confirmation about what changed in your workflow.
            </p>
          </div>
          <ActionLink href="/support" className="px-6 font-semibold">
              Contact support
              <ArrowRight className="h-4 w-4" />
            </ActionLink>
        </Card.Content>
      </Card>
    </div>
  );
}
