'use client';

import Link from 'next/link';
import { Button, Card, Chip, Surface } from '@heroui/react';
import { LazyMotion, domAnimation, m } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import {
  CheckCircle2,
  FileSearch,
  FolderKanban,
  Headphones,
  LockKeyhole,
  MessageSquareText,
  Search,
  Sparkles,
  Upload,
  Users,
} from 'lucide-react';
import { PricingSection } from '../pricing-section';

const heroSignals = [
  {
    title: 'Original audio stays intact',
    description: 'Keep the source recording safe while transcript, summary, and timestamps build around it.',
  },
  {
    title: 'Search lands on the right call',
    description: 'Find conversations by phrase, meaning, contact, or date instead of replaying files one by one.',
  },
  {
    title: 'Exports stay organized',
    description: 'Take the archive out later without turning it back into a flat pile of files.',
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
    title: 'Archive calls safely',
    description: 'Bring recordings in from old folders, phones, or desktops without losing the original file.',
    points: [
      'Bulk upload old recordings',
      'Keep source audio attached to every record',
      'Track upload and processing status clearly',
    ],
    accentClass: 'bg-primary/10 text-primary',
  },
  {
    icon: Search,
    title: 'Find the right moment later',
    description: 'Use transcript search, summaries, timestamps, and semantic search to get back to what matters fast.',
    points: [
      'Search by keyword or intent',
      'Jump back to the correct moment in the call',
      'Review by contact, date, or conversation history',
    ],
    accentClass: 'bg-secondary/10 text-secondary',
  },
  {
    icon: LockKeyhole,
    title: 'Keep ownership visible',
    description: 'Exports, private hosting, and clear plan boundaries make long-term control feel obvious.',
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
    title: 'Everything stays attached',
    description: 'Audio, transcript, summary, speaker labels, and metadata stay together as one record.',
  },
  {
    icon: Sparkles,
    title: 'AI stays narrow and useful',
    description: 'The AI layer focuses on transcript, summary, timestamps, speaker labels, and semantic search.',
  },
  {
    icon: Headphones,
    title: 'Built for real archives',
    description: 'Useful for personal records, business calls, support conversations, and sensitive voice archives.',
  },
];

const frequentlyAskedQuestions = [
  {
    question: 'What kinds of calls fit best?',
    answer:
      'Personal archives, customer conversations, business records, support discussions, and other important voice recordings fit well when they need to stay organized and searchable.',
  },
  {
    question: 'Can I host it privately?',
    answer:
      'Yes. Individuals can purchase a self-hosted license for $250, and teams that need private deployment can reach out for custom rollout and pricing.',
  },
  {
    question: 'What happens when I export my archive?',
    answer:
      'Exports stay organized by call context instead of turning into a flat unsorted dump, and the viewer helps you browse recordings and transcripts offline.',
  },
  {
    question: 'What does the AI actually do?',
    answer:
      'It handles transcript generation, summary, speaker labeling, timestamps, and semantic search so you can retrieve the right call faster.',
  },
];

const heroFloat = {
  duration: 6,
  ease: 'easeInOut' as const,
  repeat: Infinity,
  repeatType: 'mirror' as const,
};

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

export function LandingPage() {
  return (
    <LazyMotion features={domAnimation}>
      <div className="relative overflow-hidden bg-background text-foreground selection:bg-primary/15">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[760px] bg-[radial-gradient(circle_at_top_right,rgba(38,132,255,0.18),transparent_36%),radial-gradient(circle_at_top_left,rgba(13,148,136,0.16),transparent_30%),linear-gradient(to_bottom,rgba(255,255,255,0),rgba(255,255,255,0.6))]" />

        <main className="relative">
          <section className="border-b border-default-100/80">
            <div className="mx-auto grid max-w-7xl gap-14 px-4 pb-20 pt-12 md:px-6 md:pb-24 md:pt-16 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)] lg:items-center">
              <div className="space-y-8">
                <Chip variant="soft" color="accent" className="rounded-full px-3 py-1 text-xs font-medium">
                  Built for people who treat call recordings like records, not clutter
                </Chip>

                <div className="space-y-5">
                  <h1 className="max-w-4xl text-5xl font-black tracking-[-0.06em] text-foreground sm:text-6xl md:text-7xl">
                    Keep every important call easy to find, review, and export.
                  </h1>
                  <p className="max-w-2xl text-lg leading-8 text-default-600 md:text-xl">
                    vosift turns scattered recordings into a calmer archive where the original audio,
                    transcript, summary, speaker labels, timestamps, and search context stay together.
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
                  {heroSignals.map((signal, index) => (
                    <m.div
                      key={signal.title}
                      initial={{ opacity: 0, y: 18 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.35 }}
                      transition={{ duration: 0.45, delay: index * 0.08 }}
                      whileHover={{ y: -6 }}
                    >
                      <Surface
                        variant="secondary"
                        className="h-full rounded-[1.75rem] border border-default-200/80 bg-background/90 p-5 shadow-[0_16px_50px_-34px_rgba(15,23,42,0.38)]"
                      >
                        <div className="space-y-2">
                          <div className="text-sm font-semibold text-foreground">{signal.title}</div>
                          <p className="text-sm leading-6 text-default-600">{signal.description}</p>
                        </div>
                      </Surface>
                    </m.div>
                  ))}
                </div>
              </div>

              <div className="relative min-h-[460px]">
                <m.div
                  className="absolute left-0 top-10 hidden w-48 md:block"
                  animate={{ y: [0, -14, 0], rotate: [-1, 1, -1] }}
                  transition={{ ...heroFloat, duration: 7 }}
                >
                  <Card className="rounded-[1.6rem] border border-default-200/80 bg-background/90 p-4 shadow-[0_18px_55px_-34px_rgba(15,23,42,0.35)]">
                    <Card.Content className="gap-2 px-0 py-0">
                      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-default-400">
                        Original audio
                      </div>
                      <div className="text-sm font-semibold text-foreground">
                        Preserved before anything else
                      </div>
                      <div className="text-sm leading-6 text-default-600">
                        The source recording stays available while the searchable layer builds around it.
                      </div>
                    </Card.Content>
                  </Card>
                </m.div>

                <m.div
                  className="absolute bottom-12 right-0 hidden w-56 md:block"
                  animate={{ y: [0, 12, 0], rotate: [1, -1, 1] }}
                  transition={{ ...heroFloat, duration: 8 }}
                >
                  <Card className="rounded-[1.6rem] border border-default-200/80 bg-background/90 p-4 shadow-[0_18px_55px_-34px_rgba(15,23,42,0.35)]">
                    <Card.Content className="gap-2 px-0 py-0">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-default-400">
                          Search match
                        </div>
                        <span className="rounded-full bg-success/10 px-2 py-1 text-[11px] font-semibold text-success">
                          Ready
                        </span>
                      </div>
                      <div className="text-sm font-semibold text-foreground">
                        “payment confirmation from February”
                      </div>
                      <div className="text-sm leading-6 text-default-600">
                        Land on the right conversation without replaying the wrong files first.
                      </div>
                    </Card.Content>
                  </Card>
                </m.div>

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
                            Search by phrase or intent, then open the transcript, summary, and timing that explain why the result matters.
                          </Card.Description>
                        </div>
                      </Card.Header>

                      <Card.Content className="gap-4 px-0 pb-0">
                        <div className="rounded-2xl border border-default-200 bg-background px-4 py-3 text-sm text-default-500">
                          Search library:{' '}
                          <span className="font-medium text-foreground">
                            &quot;wire transfer confirmation from January&quot;
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
                            <m.div
                              key={`${entry.speaker}-${entry.stamp}`}
                              initial={{ opacity: 0, y: 12 }}
                              whileInView={{ opacity: 1, y: 0 }}
                              viewport={{ once: true, amount: 0.5 }}
                              transition={{ duration: 0.4 }}
                              whileHover={{ scale: 1.01 }}
                              className="rounded-2xl border border-default-100 bg-default-50/70 p-3"
                            >
                              <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-default-400">
                                <span className="rounded-full bg-default-100 px-2 py-1 text-[11px] font-semibold text-default-700">
                                  {entry.speaker}
                                </span>
                                <span>{entry.stamp}</span>
                              </div>
                              <p className="text-sm leading-6 text-default-700">{entry.text}</p>
                            </m.div>
                          ))}
                        </div>
                      </Card.Content>
                    </Card>

                    <div className="grid gap-4 sm:grid-cols-3">
                      {[
                        'Bulk import old recordings',
                        'Keep original audio files',
                        'Export with a viewer included',
                      ].map((item) => (
                        <m.div
                          key={item}
                          whileHover={{ y: -4 }}
                          className="rounded-[1.4rem] border border-dashed border-default-300 bg-background/85 px-4 py-4 text-sm font-medium text-default-600"
                        >
                          {item}
                        </m.div>
                      ))}
                    </div>
                  </div>
                </Surface>
              </div>
            </div>
          </section>

          <section id="features" className="mx-auto max-w-7xl px-4 py-20 md:px-6 md:py-24">
            <div className="flex flex-col gap-10">
              <SectionHeading
                eyebrow="Why It Works"
                title="Archive calls in a way that still makes sense later."
                description="vosift works best when the archive stays readable, searchable, and easy to take with you as it grows."
              />

              <div className="grid gap-5 lg:grid-cols-3">
                {productBenefits.map((benefit, index) => {
                  const Icon = benefit.icon;

                  return (
                    <m.div
                      key={benefit.title}
                      initial={{ opacity: 0, y: 18 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.25 }}
                      transition={{ duration: 0.45, delay: index * 0.08 }}
                      whileHover={{ y: -8 }}
                    >
                      <Card className="h-full rounded-[2rem] border border-default-200/80 bg-background/90 p-6 shadow-[0_18px_55px_-40px_rgba(15,23,42,0.35)]">
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
                    </m.div>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="border-y border-default-100/80 bg-default-50/60">
            <div className="mx-auto grid max-w-7xl gap-4 px-4 py-6 md:grid-cols-3 md:px-6 md:py-8">
              {trustItems.map((item, index) => {
                const Icon = item.icon;

                return (
                  <m.div
                    key={item.title}
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.4 }}
                    transition={{ duration: 0.4, delay: index * 0.06 }}
                  >
                    <Surface className="h-full rounded-[1.5rem] border border-default-200 bg-background/90 p-5">
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
                  </m.div>
                );
              })}
            </div>
          </section>

          <section id="pricing" className="border-b border-default-100/80 bg-default-50/40">
            <div className="mx-auto max-w-7xl px-4 py-20 md:px-6 md:py-24">
              <div className="space-y-10">
                <SectionHeading
                  eyebrow="Pricing"
                  title="Choose the lane that matches your archive."
                  description="Start small, then move into the plan that fits your storage, transcription, and rollout needs."
                />

                <PricingSection />
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
                {frequentlyAskedQuestions.map((item, index) => (
                  <m.div
                    key={item.question}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.25 }}
                    transition={{ duration: 0.4, delay: index * 0.05 }}
                    whileHover={{ y: -5 }}
                  >
                    <Card className="h-full rounded-[1.8rem] border border-default-200/80 bg-background/90 p-6">
                      <Card.Header className="px-0 pt-0">
                        <Card.Title className="text-lg">{item.question}</Card.Title>
                      </Card.Header>
                      <Card.Content className="px-0 pb-0 pt-2 text-sm leading-7 text-default-600">
                        {item.answer}
                      </Card.Content>
                    </Card>
                  </m.div>
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
                      Stop losing important calls in scattered folders.
                    </h2>
                    <p className="max-w-2xl text-base leading-7 text-default-600 md:text-lg">
                      Start with a small archive, prove retrieval works for your workflow, and grow from there.
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
    </LazyMotion>
  );
}
