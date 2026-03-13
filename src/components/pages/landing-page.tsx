'use client';

import Link from 'next/link';
import {
  Button,
  Card,
  Chip,
  Separator,
  Surface,
} from '@heroui/react';
import {
  ArrowRight,
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

const workspaceSignals = [
  {
    title: 'Find the right call later',
    description: 'Search by words, meaning, contact, or date instead of replaying old files to guess.',
  },
  {
    title: 'Keep the original safe',
    description: 'Store the original recording together with summary, transcript, speaker labels, and timestamps.',
  },
  {
    title: 'Stop the folder mess',
    description: 'Turn one crowded recordings folder into an organized archive that stays usable over time.',
  },
];

const workflowSteps = [
  {
    icon: Upload,
    title: 'Bring in raw recordings',
    description: 'Upload call files from your phone, desktop, or shared business archive.',
  },
  {
    icon: Headphones,
    title: 'Generate the call record',
    description: 'Create transcript, summary, speaker diarization, and timestamps around each recording.',
  },
  {
    icon: Search,
    title: 'Search the archive',
    description: 'Look up calls by phrase, meaning, contact, or date and jump to the right point quickly.',
  },
  {
    icon: ArrowRight,
    title: 'Keep it easy to revisit',
    description: 'Return to important conversations later without hunting through one giant recordings folder.',
  },
];

const capabilityCards = [
  {
    icon: MessageSquareText,
    title: 'Summaries and full transcripts',
    description:
      'Every call can keep a quick summary plus the full transcript in one place.',
  },
  {
    icon: Users,
    title: 'Speaker labels and contact history',
    description:
      'Use diarization and contact linking to keep conversations understandable later.',
  },
  {
    icon: FileSearch,
    title: 'Search that reaches the right moment',
    description:
      'Find keywords, semantic matches, and exact timestamps without scrubbing through long files.',
  },
  {
    icon: FolderKanban,
    title: 'A cleaner archive',
    description:
      'Uploads, processing state, transcripts, and storage stay visible in one library.',
  },
  {
    icon: Sparkles,
    title: 'AI that stays practical',
    description:
      'The AI layer stays focused on summary, semantic search, diarization, and timestamps.',
  },
  {
    icon: LockKeyhole,
    title: 'Exports that stay usable',
    description:
      'Export recordings, transcripts, and metadata in an organized structure with a viewer included, not a flat unsorted dump.',
  },
];

const extractedOutputs = [
  {
    label: 'Summary',
    detail: 'A quick readable recap so you do not need to replay the whole call just to remember what it covered.',
  },
  {
    label: 'Transcript',
    detail: 'The full conversation stays attached to the recording for exact review later.',
  },
  {
    label: 'Speaker labels',
    detail: 'Diarization helps separate who said what when multiple voices are in the same recording.',
  },
  {
    label: 'Searchable timeline',
    detail: 'Timestamps and semantic search make it faster to jump back to the part you actually need.',
  },
];

const frequentlyAskedQuestions = [
  {
    question: 'What kinds of calls fit best?',
    answer:
      'Personal calls, customer conversations, business records, support discussions, and other important voice recordings all fit well when they need to stay organized and searchable.',
  },
  {
    question: 'Does the AI do anything beyond transcript and search?',
    answer:
      'The AI story stays focused: summary, transcript, speaker labeling, timestamps, and semantic search. It is there to help you find and review calls, not turn them into an automated workflow.',
  },
  {
    question: 'Can I start small before migrating everything?',
    answer:
      'Yes. The free plan is set up for a small library so you can validate the workflow before expanding storage or transcription volume.',
  },
  {
    question: 'Can I own my own data with private hosting?',
    answer:
      'Yes. Individuals can purchase a self-hosted license for $300 and keep VoSift on their own private server. Teams that want private hosting can contact us by email for custom pricing.',
  },
  {
    question: 'What happens when I export my archive?',
    answer:
      'Your exported work stays organized by contact and date instead of arriving as a messy unsorted folder. We also include a viewer so it is easier to browse recordings and transcripts offline.',
  },
  {
    question: 'Where do privacy and billing live?',
    answer:
      'Inside the product. Storage, plan limits, verification, and account controls sit close to the archive they govern.',
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
    <div className="max-w-2xl space-y-4">
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
    <div className="relative overflow-hidden bg-background text-foreground selection:bg-primary/15">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[720px] bg-[radial-gradient(circle_at_top_right,rgba(38,132,255,0.16),transparent_38%),radial-gradient(circle_at_top_left,rgba(13,148,136,0.14),transparent_32%)]" />

      <main className="relative">
        <section className="border-b border-default-100/80">
          <div className="mx-auto grid max-w-7xl gap-14 px-4 pb-20 pt-12 md:px-6 md:pb-24 md:pt-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center">
            <div className="space-y-8">
              <Chip variant="soft" color="accent" className="rounded-full px-3 py-1 text-xs font-medium">
                Built for people with important call recordings to keep
              </Chip>

              <div className="space-y-5">
                <h1 className="max-w-4xl text-5xl font-black tracking-[-0.06em] text-foreground sm:text-6xl md:text-7xl">
                  Turn a messy call recordings folder into a searchable archive.
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-default-600 md:text-xl">
                  VoSift helps individuals, business owners, and small teams move important call
                  recordings out of scattered phone storage and into one organized library with
                  summaries, transcripts, speaker labels, timestamps, and semantic search, while
                  keeping the original audio easy to preserve, export, and revisit later.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link href="/signup">
                  <Button size="lg" className="h-12 rounded-full px-7 text-base font-semibold">
                    Start free workspace
                  </Button>
                </Link>
                <Link href="#workflow">
                  <Button
                    size="lg"
                    variant="secondary"
                    className="h-12 rounded-full px-7 text-base font-semibold"
                  >
                    See the workflow
                  </Button>
                </Link>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {workspaceSignals.map((signal) => (
                  <Surface
                    key={signal.title}
                    variant="secondary"
                    className="rounded-[1.75rem] border border-default-200/80 p-5"
                  >
                    <div className="space-y-2">
                      <div className="text-sm font-semibold text-foreground">{signal.title}</div>
                      <p className="text-sm leading-6 text-default-600">{signal.description}</p>
                    </div>
                  </Surface>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm text-default-500">
                {[
                  'Bulk import old recordings',
                  'Keep original audio files',
                  'Export with viewer included',
                ].map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-default-200 bg-background px-3 py-1"
                  >
                    {item}
                  </span>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm text-default-500">
                <span className="text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                  Built for
                </span>
                {['Individuals', 'Business owners', 'Small teams', 'Lawyers', 'Client-facing work'].map(
                  (label) => (
                    <span
                      key={label}
                      className="rounded-full border border-default-200 bg-default-50 px-3 py-1"
                    >
                      {label}
                    </span>
                  )
                )}
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-6 rounded-[2.5rem] bg-linear-to-br from-primary/10 via-transparent to-secondary/10 blur-3xl" />
              <Surface
                variant="default"
                className="relative overflow-hidden rounded-[2rem] border border-default-200/80 p-4 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.45)]"
              >
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                  <Card variant="secondary" className="gap-4 rounded-[1.75rem] border border-default-200/80 p-5">
                    <Card.Header className="gap-4 px-0 pt-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Search className="h-5 w-5" />
                      </div>
                      <div className="space-y-1">
                        <Card.Title className="text-base">Review workspace</Card.Title>
                        <Card.Description>
                          Search by phrase or meaning and jump back to the exact place in the transcript.
                        </Card.Description>
                      </div>
                    </Card.Header>
                    <Card.Content className="gap-4 px-0 pb-0">
                      <div className="rounded-2xl border border-default-200 bg-background px-4 py-3 text-sm text-default-500">
                        Search: <span className="font-medium text-foreground">invoice dispute from last month</span>
                      </div>

                      <div className="space-y-3 rounded-[1.5rem] border border-default-200 bg-background/70 p-4">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold text-foreground">Payment confirmation call</div>
                          <span className="rounded-full bg-success/10 px-2 py-1 text-xs font-medium text-success">
                            Transcript ready
                          </span>
                        </div>

                        {[
                          {
                            speaker: 'Caller',
                            stamp: '08:14',
                            text: 'I am trying to find the payment confirmation call from January because I need it for reference.',
                          },
                          {
                            speaker: 'Support',
                            stamp: '08:31',
                            text: 'I can see the transfer was discussed, and the amount was confirmed during this call.',
                          },
                          {
                            speaker: 'Caller',
                            stamp: '08:48',
                            text: 'That helps. I just needed the exact call and timestamp without digging through old files.',
                          },
                        ].map((entry) => (
                          <div
                            key={entry.stamp}
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

                  <div className="flex flex-col gap-4">
                    <Card className="rounded-[1.75rem] border border-default-200/80 p-5">
                      <Card.Header className="gap-4 px-0 pt-0">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-secondary/10 text-secondary">
                          <Sparkles className="h-5 w-5" />
                        </div>
                        <div className="space-y-1">
                          <Card.Title className="text-base">Call record details</Card.Title>
                          <Card.Description>Keep the useful review layer attached to the audio.</Card.Description>
                        </div>
                      </Card.Header>
                      <Card.Content className="gap-3 px-0 pb-0">
                        <div className="rounded-2xl bg-default-50 p-3">
                          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-default-400">
                            Summary
                          </div>
                          <div className="mt-2 text-sm text-default-700">
                            Payment confirmation discussed and amount verified during the call.
                          </div>
                        </div>
                        <div className="rounded-2xl bg-default-50 p-3">
                          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-default-400">
                            Speakers
                          </div>
                          <div className="mt-2 text-sm text-default-700">
                            Caller and support speaker labels kept with timestamps for quick review.
                          </div>
                        </div>
                      </Card.Content>
                    </Card>

                    <Card variant="transparent" className="rounded-[1.75rem] border border-dashed border-default-300 bg-background/80 p-5">
                      <Card.Content className="gap-3 px-0 py-0">
                        {[
                          'Jump to exact timestamps',
                          'Search by phrase or meaning',
                          'Track uploads and processing state',
                          'Review by contact or date',
                        ].map((item) => (
                          <div key={item} className="flex items-center gap-3 text-sm text-default-600">
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                            <span>{item}</span>
                          </div>
                        ))}
                      </Card.Content>
                    </Card>
                  </div>
                </div>
              </Surface>
            </div>
          </div>
        </section>

        <section className="border-b border-default-100/80 bg-default-50/60">
          <div className="mx-auto grid max-w-7xl gap-4 px-4 py-6 md:grid-cols-4 md:px-6">
            {[
              'Move recordings off your phone without losing them in the process',
              'Keep audio, transcript, summary, and timestamps together',
              'Search by date, contact, keywords, or meaning',
              'Export in an organized format with a viewer included',
            ].map((statement) => (
              <div
                key={statement}
                className="rounded-[1.5rem] border border-default-200 bg-background/90 px-4 py-4 text-sm font-medium text-default-600"
              >
                {statement}
              </div>
            ))}
          </div>
        </section>

        <section id="workflow" className="mx-auto max-w-7xl px-4 py-20 md:px-6 md:py-24">
          <SectionHeading
            eyebrow="Workflow"
            title="From one crowded recordings folder to a library you can trust."
            description="The product should shorten the path from audio file to searchable record without making you give up control. That means import, organization, transcript generation, export, and search all need to stay simple on desktop and mobile."
          />

          <div className="mt-12 grid gap-4 lg:grid-cols-4">
            {workflowSteps.map((step, index) => {
              const Icon = step.icon;

              return (
                <Card
                  key={step.title}
                  className="rounded-[1.75rem] border border-default-200/80 p-6"
                  variant={index === 1 ? 'secondary' : 'default'}
                >
                  <Card.Header className="gap-4 px-0 pt-0">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                        Step {index + 1}
                      </div>
                      <Card.Title className="text-lg">{step.title}</Card.Title>
                    </div>
                  </Card.Header>
                  <Card.Content className="px-0 pb-0 pt-2 text-sm leading-6 text-default-600">
                    {step.description}
                  </Card.Content>
                </Card>
              );
            })}
          </div>
        </section>

        <section className="border-y border-default-100/80 bg-default-50/50">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 md:px-6 md:py-24 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="space-y-6">
              <SectionHeading
                eyebrow="Capabilities"
                title="Designed around archival clarity, not extra workflow noise."
                description="The product is strongest when it stays honest about what it does well: organize recordings, preserve the original files, keep transcript context attached, and help people find the right call again later."
              />

              <Surface variant="secondary" className="rounded-[2rem] border border-default-200/80 p-6">
                <div className="space-y-4">
                  <div className="text-sm font-semibold uppercase tracking-[0.24em] text-default-400">
                    Product direction
                  </div>
                  <p className="text-base leading-7 text-default-700">
                    VoSift fits people and small businesses that treat voice recordings as important
                    records. That can be personal archives, customer calls, finance-related
                    conversations, or other call histories that need to stay searchable.
                  </p>
                  <Separator />
                  <div className="text-sm leading-6 text-default-600">
                    Instead of promising workflow automation, the public story stays centered on
                    archive organization, preserving originals, structured exports, transcription, timestamps, speaker labels, and semantic search.
                  </div>
                </div>
              </Surface>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {capabilityCards.map((item) => {
                const Icon = item.icon;

                return (
                  <Card key={item.title} className="rounded-[1.75rem] border border-default-200/80 p-6">
                    <Card.Header className="gap-4 px-0 pt-0">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-default-100 text-foreground">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="space-y-1">
                        <Card.Title className="text-lg">{item.title}</Card.Title>
                        <Card.Description>{item.description}</Card.Description>
                      </div>
                    </Card.Header>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-20 md:px-6 md:py-24">
          <div className="rounded-[2.25rem] border border-default-200/80 bg-linear-to-br from-background via-background to-default-50 p-6 md:p-10">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <div className="space-y-6">
                <SectionHeading
                  eyebrow="Call Record"
                  title="What a useful archived call should contain after upload."
                  description="Not just the audio file. A good record keeps the original recording, summary, transcript, speaker labels, timestamps, and searchable context together so the call is still useful months later."
                />

                <Card className="rounded-[1.75rem] border border-default-200/80 p-5" variant="secondary">
                  <Card.Content className="gap-4 px-0 py-0">
                    {[
                      '08:31 Caller: I only need the exact payment confirmation conversation from January.',
                      '08:48 Support: The transfer amount was confirmed on this call and the reference number is mentioned here.',
                      '09:06 Caller: Perfect. I can find the right recording now without checking every file manually.',
                    ].map((quote) => (
                      <div
                        key={quote}
                        className="rounded-2xl border border-default-100 bg-background px-4 py-3 text-sm leading-6 text-default-700"
                      >
                        {quote}
                      </div>
                    ))}
                  </Card.Content>
                </Card>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {extractedOutputs.map((item) => (
                  <Card key={item.label} className="rounded-[1.75rem] border border-default-200/80 p-5">
                    <Card.Header className="px-0 pt-0">
                      <div className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
                        {item.label}
                      </div>
                    </Card.Header>
                    <Card.Content className="px-0 pb-0 pt-0 text-sm leading-7 text-default-700">
                      {item.detail}
                    </Card.Content>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="border-y border-default-100/80 bg-default-50/60">
          <div className="mx-auto max-w-7xl px-4 py-20 md:px-6 md:py-24">
            <PricingSection />
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-20 md:px-6 md:py-24">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <SectionHeading
              eyebrow="FAQ"
              title="Questions that matter before you trust a call archive."
              description="These are the practical questions people ask before they move real recordings into a new system."
            />

            <div className="grid gap-4">
              {frequentlyAskedQuestions.map((item) => (
                <Card key={item.question} className="rounded-[1.5rem] border border-default-200/80 p-6">
                  <Card.Header className="px-0 pt-0">
                    <Card.Title className="text-lg">{item.question}</Card.Title>
                  </Card.Header>
                  <Card.Content className="px-0 pb-0 pt-1 text-sm leading-7 text-default-600">
                    {item.answer}
                  </Card.Content>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-default-100/80 bg-default-50/60">
          <div className="mx-auto max-w-7xl px-4 py-16 md:px-6">
            <Surface
              variant="secondary"
              className="flex flex-col gap-6 rounded-[2rem] border border-default-200/80 p-6 md:flex-row md:items-center md:justify-between md:p-8"
            >
              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
                  Ready to clean up the way you keep recorded calls?
                </div>
                <h3 className="text-2xl font-black tracking-[-0.04em] text-foreground md:text-3xl">
                  Start with a smaller archive, then expand once the search and transcript workflow proves itself.
                </h3>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link href="/signup">
                  <Button size="lg" className="h-12 rounded-full px-7 font-semibold">
                    Create workspace
                  </Button>
                </Link>
                <Link href="/support">
                  <Button size="lg" variant="secondary" className="h-12 rounded-full px-7 font-semibold">
                    Talk to support
                  </Button>
                </Link>
              </div>
            </Surface>
          </div>
        </section>
      </main>

      <footer className="border-t border-default-100/80 bg-background">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 text-sm text-default-500 md:flex-row md:items-center md:justify-between md:px-6">
          <div className="max-w-xl leading-6">
            VoSift turns scattered call recordings into an organized archive with transcript,
            summary, timestamps, speaker labels, and semantic search.
          </div>
          <div className="flex flex-wrap gap-4">
            <Link href="/pricing" className="hover:text-foreground">
              Pricing
            </Link>
            <Link href="/support" className="hover:text-foreground">
              Support
            </Link>
            <Link href="/changelog" className="hover:text-foreground">
              Updates
            </Link>
            <Link href="/privacy-policy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms-of-service" className="hover:text-foreground">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
