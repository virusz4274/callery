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
    title: 'Find moments instantly',
    description: 'Search across transcripts, contacts, and notes without reopening raw files.',
  },
  {
    title: 'Review with context',
    description: 'Keep speakers, timestamps, and summaries in one workspace instead of scattered tools.',
  },
  {
    title: 'Move to action',
    description: 'Pull next steps, decisions, and objections straight out of the conversation.',
  },
];

const workflowSteps = [
  {
    icon: Upload,
    title: 'Bring in raw audio',
    description: 'Upload meetings, interviews, sales calls, or support recordings in one queue.',
  },
  {
    icon: Headphones,
    title: 'Generate a review layer',
    description: 'Turn audio into speaker-aware transcripts with searchable timestamps.',
  },
  {
    icon: Search,
    title: 'Interrogate the call',
    description: 'Search by phrase, filter by contact, and jump to the exact moment that matters.',
  },
  {
    icon: ArrowRight,
    title: 'Share what matters',
    description: 'Move decisions, action items, and follow-ups back into the rest of your workflow.',
  },
];

const capabilityCards = [
  {
    icon: MessageSquareText,
    title: 'Meaningful transcript review',
    description:
      'Keep summary, transcript, speaker turns, and action items in one surface instead of switching tabs.',
  },
  {
    icon: Users,
    title: 'Contact-centered history',
    description:
      'Tie recordings to people and accounts so every conversation adds context instead of noise.',
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
      'Uploads, processing state, transcripts, and storage stay visible in one operating surface.',
  },
  {
    icon: Sparkles,
    title: 'Actionable AI outputs',
    description:
      'Extract follow-ups, decisions, objections, and themes so calls turn into usable work.',
  },
  {
    icon: LockKeyhole,
    title: 'Built for sensitive conversations',
    description:
      'Keep retention, billing, and access controls close to the content they affect.',
  },
];

const extractedOutputs = [
  {
    label: 'Action item',
    detail: 'Send revised rollout plan to Acme by Thursday with the updated migration timeline.',
  },
  {
    label: 'Decision',
    detail: 'Keep pricing unchanged this quarter and test packaging before touching the core plan.',
  },
  {
    label: 'Risk',
    detail: 'Customer is blocked by onboarding handoff and expects a named owner before renewal.',
  },
  {
    label: 'Follow-up',
    detail: 'Book a 20-minute review with sales ops after the next pilot call lands.',
  },
];

const frequentlyAskedQuestions = [
  {
    question: 'What kinds of calls fit best?',
    answer:
      'Sales conversations, customer interviews, recruiting screens, support escalations, and internal reviews all benefit when the transcript and context stay connected.',
  },
  {
    question: 'Is this just storage with transcription on top?',
    answer:
      'No. The point is operational review: searchable transcripts, contact context, extracted outputs, and a workspace that makes recorded conversations usable again.',
  },
  {
    question: 'Can I start small before migrating everything?',
    answer:
      'Yes. The free plan is set up for a small library so you can validate the workflow before expanding storage or transcription volume.',
  },
  {
    question: 'Where do privacy and billing live?',
    answer:
      'Inside the product, not as an afterthought. Storage, plan limits, verification, and account controls sit alongside the archive they govern.',
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
                Call intelligence for teams that work from recorded conversations
              </Chip>

              <div className="space-y-5">
                <h1 className="max-w-4xl text-5xl font-black tracking-[-0.06em] text-foreground sm:text-6xl md:text-7xl">
                  Turn recorded calls into a workspace your team can actually use.
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-default-600 md:text-xl">
                  VoSift is built for messy audio archives: uploads, transcripts, search, contact
                  context, and extracted next steps in one place. The goal is not just to store
                  conversations. It is to make them operational.
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
                <span className="text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                  Built for
                </span>
                {['Sales', 'Customer research', 'Support', 'Recruiting', 'Operations'].map(
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
                          Search for objections, commitments, and follow-ups inside the transcript.
                        </Card.Description>
                      </div>
                    </Card.Header>
                    <Card.Content className="gap-4 px-0 pb-0">
                      <div className="rounded-2xl border border-default-200 bg-background px-4 py-3 text-sm text-default-500">
                        Search: <span className="font-medium text-foreground">pricing objection</span>
                      </div>

                      <div className="space-y-3 rounded-[1.5rem] border border-default-200 bg-background/70 p-4">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold text-foreground">Acme pilot review</div>
                          <span className="rounded-full bg-success/10 px-2 py-1 text-xs font-medium text-success">
                            Transcript ready
                          </span>
                        </div>

                        {[
                          {
                            speaker: 'AE',
                            stamp: '08:14',
                            text: 'The rollout is straightforward, but finance needs a clearer adoption timeline.',
                          },
                          {
                            speaker: 'Buyer',
                            stamp: '08:31',
                            text: 'Pricing is not the blocker. Ownership after onboarding is the real concern.',
                          },
                          {
                            speaker: 'AE',
                            stamp: '08:48',
                            text: 'We can assign a named success lead and send the migration plan this afternoon.',
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
                          <Card.Title className="text-base">Extracted outputs</Card.Title>
                          <Card.Description>Keep the next move visible while the call is still fresh.</Card.Description>
                        </div>
                      </Card.Header>
                      <Card.Content className="gap-3 px-0 pb-0">
                        <div className="rounded-2xl bg-default-50 p-3">
                          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-default-400">
                            Decision
                          </div>
                          <div className="mt-2 text-sm text-default-700">
                            Keep current pricing, resolve onboarding ownership before the renewal.
                          </div>
                        </div>
                        <div className="rounded-2xl bg-default-50 p-3">
                          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-default-400">
                            Follow-up
                          </div>
                          <div className="mt-2 text-sm text-default-700">
                            Send the migration plan and introduce the success lead today.
                          </div>
                        </div>
                      </Card.Content>
                    </Card>

                    <Card variant="transparent" className="rounded-[1.75rem] border border-dashed border-default-300 bg-background/80 p-5">
                      <Card.Content className="gap-3 px-0 py-0">
                        {[
                          'Jump to exact timestamps',
                          'Group calls by contact',
                          'Track uploads and processing state',
                          'Move from transcript to action item',
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
              'One place for raw audio, transcripts, and next steps',
              'Searchable context tied to people and accounts',
              'A calmer workflow for QA, coaching, and research review',
              'Billing and access controls that live with the archive',
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
            title="From messy call archive to a usable review system."
            description="The product should shorten the path from audio file to decision. That means the workflow has to stay obvious, traceable, and fast on both desktop and mobile."
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
                title="Designed around how teams actually review conversations."
                description="The public site should reflect the product direction: fewer decorative promises, more clarity about how upload, search, contact history, and extracted outputs fit together."
              />

              <Surface variant="secondary" className="rounded-[2rem] border border-default-200/80 p-6">
                <div className="space-y-4">
                  <div className="text-sm font-semibold uppercase tracking-[0.24em] text-default-400">
                    Product direction
                  </div>
                  <p className="text-base leading-7 text-default-700">
                    The next phase of the redesign focuses on the product shell, recordings workspace,
                    upload queue, contact detail views, and settings surfaces. Landing is now aligned
                    to that system instead of floating above it as separate marketing.
                  </p>
                  <Separator />
                  <div className="text-sm leading-6 text-default-600">
                    Public routes now use a dedicated marketing header and full-bleed layout so the
                    site stops inheriting product spacing and chrome.
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
                  eyebrow="Review outcomes"
                  title="What a useful call record should contain after the meeting ends."
                  description="Not just the transcript. You need the important lines, the decisions, the risks, and the next actions without forcing the team to reconstruct the conversation later."
                />

                <Card className="rounded-[1.75rem] border border-default-200/80 p-5" variant="secondary">
                  <Card.Content className="gap-4 px-0 py-0">
                    {[
                      '08:31 Buyer: Pricing is not the blocker. Ownership after onboarding is the real concern.',
                      '08:48 AE: We can assign a named success lead and send the migration plan today.',
                      '09:06 Buyer: If that happens this week, we can keep the renewal on track.',
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
              title="Questions that matter before you trust another call tool."
              description="The marketing surface should answer practical questions directly. These are the points teams usually need to clear before they put real recordings into the system."
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
                  Ready to rebuild how your team uses recorded calls?
                </div>
                <h3 className="text-2xl font-black tracking-[-0.04em] text-foreground md:text-3xl">
                  Start with a smaller archive, then expand once the workflow proves itself.
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
            VoSift turns recorded conversations into searchable working context instead of another
            archive your team avoids.
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
