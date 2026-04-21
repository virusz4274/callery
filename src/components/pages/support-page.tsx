'use client';

import Link from 'next/link';
import { Button, Card, Chip, Surface } from '@heroui/react';
import { ArrowRight, FileText, LifeBuoy, Mail, MessageCircleMore, Sparkles } from 'lucide-react';
import { SupportFormCard } from '@/components/pages/support-form-card';

type SupportPageProps = {
  supportEmail: string;
};

export function SupportPage({ supportEmail }: SupportPageProps) {
  return (
    <div className="relative mx-auto max-w-6xl space-y-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(circle_at_top_left,rgba(38,132,255,0.14),transparent_34%),radial-gradient(circle_at_top_right,rgba(13,148,136,0.12),transparent_28%)]" />

      <section className="overflow-hidden rounded-[2rem] border border-default-200/80 bg-background/90 shadow-[0_24px_64px_-48px_rgba(15,23,42,0.45)]">
        <div className="grid gap-8 px-5 py-6 md:px-8 md:py-8 xl:grid-cols-[minmax(0,1.05fr)_340px] xl:items-start">
          <div className="space-y-4">
            <Chip variant="soft" color="accent" className="rounded-full px-3 py-1 text-xs font-medium">
              Help and support
            </Chip>
            <div className="space-y-3">
              <h1 className="text-4xl font-black tracking-[-0.05em] text-foreground md:text-5xl">
                Get help keeping your call archive moving.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-default-600 md:text-lg">
                Reach the Callery team, browse recent product updates, and send a detailed issue report from one place.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Chip variant="soft" color="success">
                Email support available
              </Chip>
              <Chip variant="soft" color="default">
                Product updates and docs
              </Chip>
            </div>
          </div>

          <Surface variant="secondary" className="rounded-[1.5rem] border border-default-200/80 p-5">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-accent/10 p-3 text-accent">
                  <LifeBuoy className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-semibold text-foreground">Fastest path</div>
                  <p className="mt-1 text-sm leading-6 text-default-500">
                    Use email for archive imports, Samsung call-history workflows, billing questions, or product feedback that needs follow-up.
                  </p>
                </div>
              </div>
              <a href={`mailto:${supportEmail}`} className="block">
                <Button className="w-full rounded-full font-semibold">
                  Email support
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </a>
            </div>
          </Surface>
        </div>

        <div className="grid gap-3 border-t border-default-100/80 bg-default-50/50 px-5 py-5 md:grid-cols-3 md:px-8">
          {[
            {
              icon: MessageCircleMore,
              title: 'Describe the issue clearly',
              description: 'Include what screen you were on, what happened, and what you expected instead.',
            },
            {
              icon: Sparkles,
              title: 'Share product context',
              description: 'Feature requests are easier to act on when we understand the workflow you were trying to complete.',
            },
            {
              icon: Mail,
              title: 'Expect follow-up by email',
              description: 'We use your contact details to reply with fixes, clarifications, or release updates.',
            },
          ].map((item) => {
            const Icon = item.icon;

            return (
              <Surface key={item.title} variant="secondary" className="rounded-[1.5rem] border border-default-200/80 p-4">
                <div className="space-y-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-background text-accent">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="font-semibold text-foreground">{item.title}</div>
                  <p className="text-sm leading-6 text-default-500">{item.description}</p>
                </div>
              </Surface>
            );
          })}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)]">
        <Card className="rounded-[1.9rem] border border-default-200/80 bg-background/95 shadow-[0_24px_64px_-48px_rgba(15,23,42,0.45)]">
          <Card.Content className="space-y-4 p-6">
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                Self-serve resources
              </div>
              <h2 className="text-2xl font-bold tracking-[-0.03em] text-foreground">
                Start with the quickest references
              </h2>
            </div>

            <div className="space-y-3">
              <Link
                href="/changelog"
                className="block rounded-[1.35rem] border border-default-200/80 bg-default-50/70 p-4 transition-colors hover:border-accent/20 hover:bg-accent/5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 font-semibold text-foreground">
                      <FileText className="h-4 w-4 text-accent" />
                      Product changelog
                    </div>
                    <p className="mt-2 text-sm leading-6 text-default-500">
                      Review shipped updates, improvements, and current product direction.
                    </p>
                  </div>
                  <ArrowRight className="mt-1 h-4 w-4 text-default-300" />
                </div>
              </Link>

              <Link
                href="/pricing"
                className="block rounded-[1.35rem] border border-default-200/80 bg-default-50/70 p-4 transition-colors hover:border-accent/20 hover:bg-accent/5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-foreground">Plans and billing</div>
                    <p className="mt-2 text-sm leading-6 text-default-500">
                      Check what is included in each plan before you reach out about upgrades or plan limits.
                    </p>
                  </div>
                  <ArrowRight className="mt-1 h-4 w-4 text-default-300" />
                </div>
              </Link>
            </div>
          </Card.Content>
        </Card>

        <SupportFormCard />
      </div>
    </div>
  );
}
