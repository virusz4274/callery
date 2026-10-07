'use client';

import { ActionLink } from '@/components/action-link';
import { Card, Chip, Surface } from '@heroui/react';
import type { LucideIcon } from 'lucide-react';
import {
  CheckCircle2,
  LockKeyhole,
  Search,
  Upload,
} from 'lucide-react';
import { PricingSection } from '../pricing-section';
import type { PublicPlan } from '@/app/actions/plans';
import { landingPageFaqs, landingPageFeatureList } from '@/components/pages/landing-page-content';

const heroSignals = [
  {
    title: 'Folder-based imports',
    description: 'Samsung and other phones that save call audio to folders.',
  },
  {
    title: 'Searchable call history',
    description: 'Find calls by keyword, contact, or meaning — not by filename.',
  },
  {
    title: 'Original audio preserved',
    description: 'Source file stays attached while transcripts and summaries layer on top.',
  },
];

const productBenefits: Array<{
  icon: LucideIcon;
  title: string;
  description: string;
  points: string[];
  accentClass: string;
}> = [
  {
    icon: Upload,
    title: 'Import call recordings from folders',
    description: 'Bring recordings in from Samsung devices, backup folders, desktops, and other phones without losing the original file.',
    points: [
      'Bulk upload from exported or synced folders',
      'Keep source audio attached to every record',
      'Track upload and processing status clearly',
    ],
    accentClass: 'bg-primary/10 text-primary',
  },
  {
    icon: Search,
    title: 'Search call history instead of browsing files',
    description: 'Use transcripts, summaries, timestamps, and semantic search to get back to the right call fast.',
    points: [
      'Search by keyword or intent',
      'Jump back to the correct moment in the call',
      'Review by contact, date, or conversation history',
    ],
    accentClass: 'bg-secondary/10 text-secondary',
  },
  {
    icon: LockKeyhole,
    title: 'Keep ownership and exportability clear',
    description: 'Exports, private hosting options, and organized records make long-term control obvious.',
    points: [
      'Structured exports with an offline viewer',
      'Private hosting path for sensitive archives',
      'Clear lanes from free to custom rollout',
    ],
    accentClass: 'bg-success/10 text-success',
  },
];

const workflowSteps = [
  {
    title: 'Import recordings from folders',
    description: 'Bring in old call recordings from Samsung storage, desktop backups, or synced directories.',
  },
  {
    title: 'Add transcript and summary layers',
    description: 'Turn each audio file into a searchable record with transcript, timestamps, speaker labels, and summaries.',
  },
  {
    title: 'Search and retrieve later',
    description: 'Find the exact payment call, support discussion, or personal conversation when you need it again.',
  },
];

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="max-w-3xl space-y-4">
      <div className="text-xs font-semibold uppercase tracking-[0.26em] text-primary">
        {eyebrow}
      </div>
      <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl md:text-5xl">
        {title}
      </h2>
      {description ? (
        <p className="text-base leading-7 text-default-600 md:text-lg">
          {description}
        </p>
      ) : null}
    </div>
  );
}

export function LandingPage({
  availablePlans = [],
  salesEmail,
}: {
  availablePlans?: PublicPlan[];
  salesEmail: string;
}) {
  return (
    <div className="relative overflow-hidden bg-background text-foreground selection:bg-primary/15">


      <main className="relative">
        <section className="border-b border-default-100/80">
          <div className="mx-auto grid max-w-7xl gap-14 px-4 pb-20 pt-12 md:px-6 md:pb-24 md:pt-16 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)] lg:items-center">
            <div className="space-y-8">
              <Chip variant="soft" color="accent" size="sm">
                Folder-based call recording archive
              </Chip>

              <div className="space-y-5">
                <h1 className="max-w-5xl text-5xl font-semibold tracking-tight text-foreground sm:text-6xl md:text-7xl">
                  Turn call recordings into a searchable archive.
                </h1>
                <p className="max-w-3xl text-lg leading-8 text-default-600 md:text-xl">
                  Import recordings from Samsung or any folder-based source, then search by transcript, contact, or meaning.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <ActionLink href="/signup" size="lg" className="h-12 px-7 text-base font-semibold">
                    Start free workspace
                  </ActionLink>
                <ActionLink href="/pricing" size="lg" variant="secondary" className="h-12 px-7 text-base font-semibold">
                    Explore plans
                  </ActionLink>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {heroSignals.map((signal) => (
                  <Surface
                    key={signal.title}
                    variant="secondary"
                    className="h-full rounded-xl border border-border bg-surface p-5 shadow-none"
                  >
                    <div className="space-y-2">
                      <div className="text-sm font-semibold text-foreground">{signal.title}</div>
                      <p className="text-sm leading-6 text-default-600">{signal.description}</p>
                    </div>
                  </Surface>
                ))}
              </div>
            </div>

            <div className="relative min-h-[460px]">


              <Surface
                variant="default"
                className="relative ml-auto overflow-hidden rounded-2xl border border-border bg-surface p-4 shadow-none md:max-w-[38rem] md:p-5"
              >
                <div className="grid gap-4">
                  <Card variant="secondary" className="rounded-xl border border-default-200/80 p-5">
                    <Card.Header className="gap-4 px-0 pt-0">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Search className="h-5 w-5" />
                      </div>
                      <div className="space-y-1">
                        <Card.Title className="text-base">Find the right call in context</Card.Title>
                        <Card.Description>
                          Search transcripts, summaries, and speaker labels across your full archive.
                        </Card.Description>
                      </div>
                    </Card.Header>

                    <Card.Content className="gap-4 px-0 pb-0">
                      <div className="rounded-2xl border border-default-200 bg-background px-4 py-3 text-sm text-default-500">
                        Search library:{' '}
                        <span className="font-medium text-foreground">
                          &quot;payment confirmation call from January&quot;
                        </span>
                      </div>

                      <div className="space-y-3 rounded-xl border border-default-200 bg-background/70 p-4">
                        {[
                          {
                            speaker: 'Caller',
                            stamp: '08:14',
                            text: 'I am trying to find the payment confirmation call from January because I need it for reference.',
                          },
                          {
                            speaker: 'Support',
                            stamp: '08:31',
                            text: 'The transfer was discussed here, and the amount was confirmed during this section of the call.',
                          },
                          {
                            speaker: 'Summary',
                            stamp: 'Ready',
                            text: 'Transcript, timestamps, and summary all stay attached to the original recording.',
                          },
                        ].map((entry) => (
                          <div
                            key={`${entry.speaker}-${entry.stamp}`}
                            className="rounded-2xl border border-default-100 bg-default-50/70 p-3"
                          >
                            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-default-400">
                              <span className="rounded-full bg-default-100 px-2 py-1 text-[11px] font-semibold text-default-700">
                                {entry.speaker}
                              </span>
                              <span>{entry.stamp}</span>
                            </div>
                            <p className="text-sm leading-6 text-default-700">{entry.text}</p>
                          </div>
                        ))}
                      </div>
                    </Card.Content>
                  </Card>

                  <div className="grid gap-4 sm:grid-cols-3">
                    {landingPageFeatureList.slice(0, 3).map((item) => (
                      <div
                        key={item}
                        className="rounded-xl border border-dashed border-default-300 bg-background/85 px-4 py-4 text-sm font-medium text-default-600"
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </Surface>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-20 md:px-6 md:py-24">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
            <SectionHeading
              eyebrow="What It Is"
              title="A searchable call archive for recordings that would otherwise sit in folders."
              description="For people who already have recordings and need a better way to find them again."
            />

            <div className="grid gap-4 md:grid-cols-3">
              {workflowSteps.map((step, index) => (
                <Card key={step.title} className="rounded-2xl border border-border bg-surface p-6">
                  <Card.Header className="px-0 pt-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {index + 1}
                    </div>
                  </Card.Header>
                  <Card.Content className="space-y-3 px-0 pb-0">
                    <Card.Title className="text-lg">{step.title}</Card.Title>
                    <p className="text-sm leading-7 text-default-600">{step.description}</p>
                  </Card.Content>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-7xl px-4 py-20 md:px-6 md:py-24">
          <div className="flex flex-col gap-10">
            <SectionHeading
              eyebrow="Who It Helps"
              title="Built for Samsung users, but not limited to one phone brand."
              description="Any phone that stores recordings in accessible folders can be the source."
            />

            <div className="grid gap-5 lg:grid-cols-3">
              {productBenefits.map((benefit) => {
                const Icon = benefit.icon;

                return (
                  <Card
                    key={benefit.title}
                    className="h-full rounded-2xl border border-border bg-surface p-6 shadow-none"
                  >
                    <Card.Header className="gap-4 px-0 pt-0">
                      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${benefit.accentClass}`}>
                        <Icon className="h-5 w-5" />
                      </div>

                      <div className="space-y-2">
                        <Card.Title className="text-xl">{benefit.title}</Card.Title>
                        <Card.Description className="text-sm leading-6">
                          {benefit.description}
                        </Card.Description>
                      </div>
                    </Card.Header>

                    <Card.Content className="gap-3 px-0 pb-0 pt-4">
                      {benefit.points.map((point) => (
                        <div key={point} className="flex items-start gap-3 text-sm leading-6 text-default-600">
                          <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" />
                          <span>{point}</span>
                        </div>
                      ))}
                    </Card.Content>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
          <Surface variant="secondary" className="rounded-2xl border border-default-200/80 p-6 md:p-8">
            <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
              <div className="space-y-3">
                <Chip variant="soft" color="accent" size="sm">
                  Why not native storage?
                </Chip>
                <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                  Phones are built to save recordings. Archives are built to retrieve them later.
                </h2>
              </div>
              <p className="text-sm leading-7 text-default-600 md:text-base">
                Samsung and other apps capture calls, but they don&apos;t turn a growing folder into a searchable archive with transcript search, contacts, and retrieval.
              </p>
            </div>
          </Surface>
        </section>

        <section id="pricing" className="border-b border-default-100/80 bg-default-50/40">
          <div className="mx-auto max-w-7xl px-4 py-20 md:px-6 md:py-24">
            <div className="space-y-10">
              <SectionHeading
                eyebrow="Pricing"
                title="Choose the lane that matches your archive."
                description="Start small, then move into the plan that fits your storage, transcription, and rollout needs as your call history grows."
              />

              <PricingSection availablePlans={availablePlans} salesEmail={salesEmail} />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-20 md:px-6 md:py-24">
          <div className="space-y-10">
            <SectionHeading
              eyebrow="FAQ"
              title="Common questions"
            />

            <div className="grid gap-4 md:grid-cols-2">
              {landingPageFaqs.map((item) => (
                <Card key={item.question} className="h-full rounded-2xl border border-border bg-surface p-6">
                  <Card.Header className="px-0 pt-0">
                    <Card.Title className="text-lg">{item.question}</Card.Title>
                  </Card.Header>
                  <Card.Content className="px-0 pb-0 pt-2 text-sm leading-7 text-default-600">
                    {item.answer}
                  </Card.Content>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 pb-20 md:px-6 md:pb-24">
          <div className="mx-auto max-w-7xl">
            <Card className="overflow-hidden rounded-2xl border border-default-200/80 bg-linear-to-br from-background via-background to-default-50 p-6 shadow-none md:p-10">
              <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="space-y-4">
                  <Chip variant="soft" color="accent" size="sm">
                    Ready when you are
                  </Chip>
                  <h2 className="max-w-3xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                    Turn scattered recordings into a searchable call archive.
                  </h2>
                  <p className="max-w-2xl text-base leading-7 text-default-600 md:text-lg">
                    Start with a smaller archive and scale from there.
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                  <ActionLink href="/signup" size="lg" className="w-full px-7 text-base font-semibold">
                      Create workspace
                    </ActionLink>
                  <ActionLink href="/support" size="lg" variant="secondary" className="w-full px-7 text-base font-semibold">
                      Talk to support
                    </ActionLink>
                </div>
              </div>
            </Card>
          </div>
        </section>
      </main>
    </div>
  );
}
