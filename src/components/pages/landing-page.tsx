'use client';

import Link from 'next/link';
import { Button, Card, Chip, Surface } from '@heroui/react';
import type { LucideIcon } from 'lucide-react';
import {
  CheckCircle2,
  FolderOpen,
  FolderKanban,
  Headphones,
  LockKeyhole,
  SearchCheck,
  Search,
  Sparkles,
  Upload,
  Users,
} from 'lucide-react';
import { PricingSection } from '../pricing-section';
import type { PublicPlan } from '@/app/actions/plans';
import { landingPageFaqs, landingPageFeatureList } from '@/components/pages/landing-page-content';

const heroSignals = [
  {
    title: 'Folder-based imports',
    description: 'Bring in recordings from Samsung and other phones that store call audio in accessible folders.',
  },
  {
    title: 'Searchable call history',
    description: 'Find the right conversation by keyword, meaning, contact, or date instead of replaying files one by one.',
  },
  {
    title: 'Original audio preserved',
    description: 'Keep the source file attached while transcripts, summaries, and timestamps are layered on top.',
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

const trustItems = [
  {
    icon: FolderKanban,
    title: 'Every call stays together',
    description: 'Audio, transcript, summary, speaker labels, and metadata stay together as one record.',
  },
  {
    icon: SearchCheck,
    title: 'The AI is retrieval-focused',
    description: 'The AI layer focuses on transcript, summary, timestamps, speaker labels, and semantic search.',
  },
  {
    icon: Headphones,
    title: 'Built for real call archives',
    description: 'Useful for personal records, business calls, support conversations, and sensitive voice archives.',
  },
];

const compatibilityItems = [
  {
    icon: FolderOpen,
    title: 'Samsung call recording folders',
    description:
      'Callery is designed for the common workflow where Samsung call recordings are saved on-device and later copied or synced into folders.',
  },
  {
    icon: Users,
    title: 'Other phones with folder exports',
    description:
      'If a phone or call recording app stores recordings in accessible folders, Callery can treat those files as an archive source too.',
  },
  {
    icon: Sparkles,
    title: 'One searchable workspace',
    description:
      'Mixed imports from old phones, desktops, and exported backups can live in one searchable call archive instead of staying scattered.',
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

const comparisonPoints = [
  {
    title: 'Native tools are good for recent calls',
    description: 'Call recording apps and phone galleries usually help with what is still fresh, not with deep call history.',
  },
  {
    title: 'Archives need structure',
    description: 'Once recordings pile up in folders, you need transcript search, contact context, and exportable organization.',
  },
  {
    title: 'Retrieval matters more than storage',
    description: 'Saving files is not the same as finding the right conversation quickly months later.',
  },
];

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="max-w-3xl space-y-4">
      <div className="text-xs font-semibold uppercase tracking-[0.26em] text-primary">
        {eyebrow}
      </div>
      <h2 className="text-3xl font-black tracking-[-0.04em] text-foreground sm:text-4xl md:text-5xl">
        {title}
      </h2>
      <p className="text-base leading-7 text-default-600 md:text-lg">
        {description}
      </p>
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
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[760px] bg-[radial-gradient(circle_at_top_right,rgba(38,132,255,0.18),transparent_36%),radial-gradient(circle_at_top_left,rgba(13,148,136,0.16),transparent_30%),linear-gradient(to_bottom,rgba(255,255,255,0),rgba(255,255,255,0.6))]" />

      <main className="relative">
        <section className="border-b border-default-100/80">
          <div className="mx-auto grid max-w-7xl gap-14 px-4 pb-20 pt-12 md:px-6 md:pb-24 md:pt-16 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)] lg:items-center">
            <div className="space-y-8">
              <Chip variant="soft" color="accent" className="rounded-full px-3 py-1 text-xs font-medium">
                Built for Samsung and any phone with folder-based recordings
              </Chip>

              <div className="space-y-5">
                <h1 className="max-w-5xl text-5xl font-black tracking-[-0.06em] text-foreground sm:text-6xl md:text-7xl">
                  Turn call recordings into a searchable archive with transcripts and AI search.
                </h1>
                <p className="max-w-3xl text-lg leading-8 text-default-600 md:text-xl">
                  Callery is a call recording archive for Samsung users and anyone else who stores call audio in folders.
                  Import recordings, keep the original files safe, and search your call history by transcript,
                  summary, timestamp, contact, or meaning.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link href="/signup">
                  <Button size="lg" className="h-12 rounded-full px-7 text-base font-semibold">
                    Start free workspace
                  </Button>
                </Link>
                <Link href="/pricing">
                  <Button
                    size="lg"
                    variant="secondary"
                    className="h-12 rounded-full px-7 text-base font-semibold"
                  >
                    Explore plans
                  </Button>
                </Link>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {heroSignals.map((signal) => (
                  <Surface
                    key={signal.title}
                    variant="secondary"
                    className="h-full rounded-[1.75rem] border border-default-200/80 bg-background/90 p-5 shadow-[0_16px_50px_-34px_rgba(15,23,42,0.38)]"
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
              <div className="absolute inset-10 rounded-[2.75rem] bg-linear-to-br from-primary/12 via-transparent to-secondary/10 blur-3xl" />

              <Surface
                variant="default"
                className="relative ml-auto overflow-hidden rounded-[2.25rem] border border-default-200/80 bg-background/90 p-4 shadow-[0_28px_90px_-44px_rgba(15,23,42,0.45)] md:max-w-[38rem] md:p-5"
              >
                <div className="grid gap-4">
                  <Card variant="secondary" className="rounded-[1.8rem] border border-default-200/80 p-5">
                    <Card.Header className="gap-4 px-0 pt-0">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Search className="h-5 w-5" />
                      </div>
                      <div className="space-y-1">
                        <Card.Title className="text-base">Find the right call in context</Card.Title>
                        <Card.Description>
                          Search by phrase or intent, then open the transcript, summary, and timing that explain why the result matters on desktop, tablet, or phone.
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

                      <div className="space-y-3 rounded-[1.5rem] border border-default-200 bg-background/70 p-4">
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
                        className="rounded-[1.4rem] border border-dashed border-default-300 bg-background/85 px-4 py-4 text-sm font-medium text-default-600"
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
              description="Callery is for people who already have call recordings and need a better way to keep them, understand them, and find them again later."
            />

            <div className="grid gap-4 md:grid-cols-3">
              {workflowSteps.map((step, index) => (
                <Card key={step.title} className="rounded-[1.8rem] border border-default-200/80 bg-background/90 p-6">
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
              title="Samsung users are a natural fit, but the workflow is bigger than one phone brand."
              description="If your recordings can be copied or synced out of phone storage into folders, Callery can turn that raw library into a searchable archive on desktop or tablet."
            />

            <div className="grid gap-5 lg:grid-cols-3">
              {productBenefits.map((benefit) => {
                const Icon = benefit.icon;

                return (
                  <Card
                    key={benefit.title}
                    className="h-full rounded-[2rem] border border-default-200/80 bg-background/90 p-6 shadow-[0_18px_55px_-40px_rgba(15,23,42,0.35)]"
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
          <Surface variant="secondary" className="rounded-[2rem] border border-default-200/80 p-6 md:p-8">
            <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
              <div className="space-y-3">
                <Chip variant="soft" color="accent" className="rounded-full px-3 py-1 text-xs font-medium">
                  Why not native storage?
                </Chip>
                <h2 className="text-3xl font-black tracking-[-0.04em] text-foreground md:text-4xl">
                  Phones are built to save recordings. Archives are built to retrieve them later.
                </h2>
              </div>
              <div className="space-y-3 text-sm leading-7 text-default-600 md:text-base">
                <p>
                  Samsung and call recording apps can help you capture recent calls, but they do not turn a growing
                  folder tree into a searchable call archive.
                </p>
                <p>
                  Callery adds transcript search, summaries, timestamps, and contact context so your call history is
                  still usable when you need something from months ago.
                </p>
              </div>
            </div>
          </Surface>
        </section>

        <section className="border-y border-default-100/80 bg-default-50/60">
          <div className="mx-auto grid max-w-7xl gap-4 px-4 py-6 md:grid-cols-3 md:px-6 md:py-8">
            {trustItems.map((item) => {
              const Icon = item.icon;

              return (
                <Surface key={item.title} className="h-full rounded-[1.5rem] border border-default-200 bg-background/90 p-5">
                  <div className="space-y-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-base font-semibold text-foreground">{item.title}</div>
                      <p className="text-sm leading-6 text-default-600">{item.description}</p>
                    </div>
                  </div>
                </Surface>
              );
            })}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-20 md:px-6 md:py-24">
          <div className="space-y-10">
            <SectionHeading
              eyebrow="Compatibility"
              title="Use Callery when your call recordings already live in folders."
              description="The product is especially useful when recordings are trapped in device storage, synced directories, or exported backup folders and need to become searchable again."
            />

            <div className="grid gap-5 lg:grid-cols-3">
              {compatibilityItems.map((item) => {
                const Icon = item.icon;

                return (
                  <Card key={item.title} className="rounded-[2rem] border border-default-200/80 bg-background/90 p-6">
                    <Card.Header className="gap-4 px-0 pt-0">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary/10 text-secondary">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="space-y-2">
                        <Card.Title className="text-xl">{item.title}</Card.Title>
                        <Card.Description className="text-sm leading-6">
                          {item.description}
                        </Card.Description>
                      </div>
                    </Card.Header>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-20 md:px-6 md:py-24">
          <div className="space-y-10">
            <SectionHeading
              eyebrow="Why It Works"
              title="Callery is built for long-tail retrieval, not just storage."
              description="When the archive gets large, the job is no longer saving one more audio file. The job is finding the right conversation quickly and confidently."
            />

            <div className="grid gap-4 md:grid-cols-3">
              {comparisonPoints.map((item) => (
                <Card key={item.title} className="rounded-[1.8rem] border border-default-200/80 bg-background/90 p-6">
                  <Card.Content className="space-y-3 px-0 py-0">
                    <Card.Title className="text-lg">{item.title}</Card.Title>
                    <p className="text-sm leading-7 text-default-600">{item.description}</p>
                  </Card.Content>
                </Card>
              ))}
            </div>
          </div>
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
              title="Questions that matter before you trust a call archive."
              description="These are the practical questions people ask before moving important recordings into a new home."
            />

            <div className="grid gap-4 md:grid-cols-2">
              {landingPageFaqs.map((item) => (
                <Card key={item.question} className="h-full rounded-[1.8rem] border border-default-200/80 bg-background/90 p-6">
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
            <Card className="overflow-hidden rounded-[2.25rem] border border-default-200/80 bg-linear-to-br from-background via-background to-default-50 p-6 shadow-[0_24px_64px_-48px_rgba(15,23,42,0.45)] md:p-10">
              <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="space-y-4">
                  <Chip variant="soft" color="accent" className="rounded-full px-3 py-1 text-xs font-medium">
                    Ready when you are
                  </Chip>
                  <h2 className="max-w-3xl text-3xl font-black tracking-[-0.04em] text-foreground sm:text-4xl">
                    Turn scattered recordings into a searchable call archive.
                  </h2>
                  <p className="max-w-2xl text-base leading-7 text-default-600 md:text-lg">
                    Start with a smaller archive, prove retrieval works for your workflow, and grow from there.
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                  <Link href="/signup">
                    <Button size="lg" className="w-full rounded-full px-7 text-base font-semibold">
                      Create workspace
                    </Button>
                  </Link>
                  <Link href="/support">
                    <Button
                      size="lg"
                      variant="secondary"
                      className="w-full rounded-full px-7 text-base font-semibold"
                    >
                      Talk to support
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>
          </div>
        </section>
      </main>
    </div>
  );
}
