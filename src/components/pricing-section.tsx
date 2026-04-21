'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button, Card, Chip, Separator, Spinner, Surface } from '@heroui/react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  Building2,
  Check,
  FolderKanban,
  Headphones,
  Rocket,
  Sparkles,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/toast-provider';
import { authFetch } from '@/lib/api-client';
import type { PublicPlan } from '@/app/actions/plans';

const addOns = [
  {
    title: 'Advanced AI transcription',
    detail: 'Higher-accuracy transcription for larger archives or recordings that need closer review.',
    price: '$0.05',
    cadence: '/minute',
  },
  {
    title: 'Additional storage',
    detail: 'Expand your archive as more phone recordings and historical calls move into one library.',
    price: '$2',
    cadence: '/GB / month',
  },
];

type PricingSectionProps = {
  availablePlans?: PublicPlan[];
  salesEmail: string;
};

type DisplayPlan = {
  id: string;
  name: string;
  description: string;
  price: string;
  cadence: string;
  highlights: string[];
  icon: LucideIcon;
  accentClass: string;
  badge?: string;
  featured?: boolean;
  action: 'signup' | 'checkout' | 'contact';
  ctaLabel: string;
  sourcePlan?: PublicPlan;
};

type ComparisonRow = {
  label: string;
  description: string;
  values: Record<string, string>;
};

function formatCadence(interval: PublicPlan['interval']) {
  if (interval === 'monthly') {
    return '/month';
  }

  if (interval === 'yearly') {
    return '/year';
  }

  if (interval === 'lifetime') {
    return 'one-time';
  }

  return '';
}

function formatPrice(value: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

function getPlanComparisonValue(plan: DisplayPlan) {
  const normalizedHighlights = plan.highlights.map((item) => item.toLowerCase());
  const storageHighlight = plan.highlights.find((item) => item.toLowerCase().includes('storage'));
  const hasSemanticSearch = normalizedHighlights.some((item) => item.includes('semantic search'));
  const hasBasicSearch = normalizedHighlights.some(
    (item) => item.includes('searchable transcript library') || item.includes('search across')
  );
  const hasAdvancedTranscription = normalizedHighlights.some((item) =>
    item.includes('advanced ai transcription')
  );
  const hasBasicTranscription = normalizedHighlights.some((item) => item.includes('basic transcription'));
  const hasPrioritySupport = normalizedHighlights.some((item) => item.includes('priority support'));

  if (plan.id === 'custom') {
    return {
      storage: 'Custom archive size',
      transcription: 'Custom workflow',
      search: 'Custom retrieval setup',
      support: 'Rollout and migration help',
      hosting: 'Private deployment',
    };
  }

  if (plan.id === 'free') {
    return {
      storage: '100 MB',
      transcription: 'Basic transcription',
      search: 'Transcript search',
      support: 'Self-serve support',
      hosting: 'Shared cloud workspace',
    };
  }

  return {
    storage: storageHighlight ?? 'Larger archive limits',
    transcription: hasAdvancedTranscription
      ? 'Advanced AI transcription'
      : hasBasicTranscription
        ? 'Basic transcription'
        : 'Included transcription',
    search: hasSemanticSearch ? 'Semantic + transcript search' : hasBasicSearch ? 'Transcript search' : 'Included search',
    support: hasPrioritySupport ? 'Priority support' : plan.featured ? 'Priority email support' : 'Standard email support',
    hosting: 'Shared cloud workspace',
  };
}

export function PricingSection({ availablePlans = [], salesEmail }: PricingSectionProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState<string | null>(null);

  const paidPlans = [...availablePlans].sort((a, b) => {
    if (a.price !== b.price) {
      return a.price - b.price;
    }

    return a.name.localeCompare(b.name);
  });

  const featuredPlanId =
    paidPlans.find((plan) => plan.name.toLowerCase().includes('pro'))?.id ??
    paidPlans[Math.min(1, Math.max(paidPlans.length - 1, 0))]?.id ??
    null;

  const paidPlanDecor = [
    { icon: FolderKanban, accentClass: 'bg-secondary/10 text-secondary' },
    { icon: Sparkles, accentClass: 'bg-primary/10 text-primary' },
    { icon: Headphones, accentClass: 'bg-success/10 text-success' },
  ] as const;

  const plans: DisplayPlan[] = [
    {
      id: 'free',
      name: 'Free',
      description: 'For validating the archive experience before you move more recordings in.',
      price: '$0',
      cadence: '/month',
      highlights: [
        '100 MB storage',
        'Basic transcription',
        'Search across your transcript library',
        'A simple starting point for personal or occasional call archives',
      ],
      icon: Rocket,
      accentClass: 'bg-default-100 text-foreground',
      badge: 'Entry point',
      action: 'signup',
      ctaLabel: 'Start free',
    },
    ...paidPlans.map<DisplayPlan>((plan, index) => {
      const decor = paidPlanDecor[index % paidPlanDecor.length];
      const isFeatured = plan.id === featuredPlanId;

      return {
        id: plan.id,
        name: plan.name,
        description: plan.description || 'For archives that need more capacity and faster retrieval.',
        price: formatPrice(plan.price, plan.currency || 'USD'),
        cadence: formatCadence(plan.interval),
        highlights:
          plan.features.length > 0
            ? plan.features
            : [
                'More archive storage',
                'Advanced transcription options',
                'Summary, timestamps, and speaker labels',
                'A better fit for active business call libraries',
              ],
        icon: decor.icon,
        accentClass: decor.accentClass,
        badge: isFeatured ? 'Most popular' : undefined,
        featured: isFeatured,
        action: plan.isPurchasable ? 'checkout' : 'contact',
        ctaLabel: plan.isPurchasable ? `Choose ${plan.name}` : `Contact sales`,
        sourcePlan: plan,
      };
    }),
    {
      id: 'custom',
      name: 'Custom',
      description: 'For teams that need shared archives, rollout help, private hosting, or custom billing.',
      price: 'Custom',
      cadence: '',
      highlights: [
        'Shared or larger archive options',
        'Rollout guidance for sensitive recordings',
        'Custom controls and support expectations',
        'Private deployment and custom pricing paths',
      ],
      icon: Building2,
      accentClass: 'bg-warning/10 text-warning',
      badge: 'Talk to us',
      action: 'contact' as const,
      ctaLabel: 'Talk to sales',
    },
  ];

  const comparisonRows: ComparisonRow[] = [
    {
      label: 'Storage',
      description: 'How much archive space you start with.',
      values: Object.fromEntries(plans.map((plan) => [plan.id, getPlanComparisonValue(plan).storage])),
    },
    {
      label: 'Transcription',
      description: 'What transcript workflow comes with the plan.',
      values: Object.fromEntries(plans.map((plan) => [plan.id, getPlanComparisonValue(plan).transcription])),
    },
    {
      label: 'Search',
      description: 'How you get back to the right call later.',
      values: Object.fromEntries(plans.map((plan) => [plan.id, getPlanComparisonValue(plan).search])),
    },
    {
      label: 'Support',
      description: 'What help path you can expect as the archive grows.',
      values: Object.fromEntries(plans.map((plan) => [plan.id, getPlanComparisonValue(plan).support])),
    },
    {
      label: 'Hosting',
      description: 'Where the archive runs and when private deployment enters the picture.',
      values: Object.fromEntries(plans.map((plan) => [plan.id, getPlanComparisonValue(plan).hosting])),
    },
  ];

  const handleSubscribe = async (plan: PublicPlan) => {
    setIsLoading(plan.id);

    try {
      const response = await authFetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planKey: plan.key,
          successUrl: '/settings?tab=billing&success=true',
          cancelUrl: '/pricing?canceled=true',
        }),
      });

      if (!response.ok) {
        const data = await response.json();

        if (response.status === 401) {
          router.push('/login?redirect=/pricing');
          return;
        }

        throw new Error(data.error || 'Failed to start checkout');
      }

      const { url } = await response.json();

      if (!url) {
        throw new Error('No checkout URL returned');
      }

      window.location.href = url;
    } catch (error) {
      console.error('Checkout error:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Something went wrong',
        status: 'danger',
      });
      setIsLoading(null);
    }
  };

  return (
    <div className="space-y-10">
      <div className="mx-auto max-w-3xl text-center">
        <Chip variant="soft" color="accent" className="rounded-full px-3 py-1 text-xs font-medium">
          Pricing
        </Chip>
        <h2 className="mt-4 text-3xl font-black tracking-[-0.04em] text-foreground md:text-5xl">
          Pick the plan that matches how much call history you need to rescue and search.
        </h2>
        <p className="mt-4 text-lg leading-8 text-default-600">
          Compare storage, transcription, AI search, support, and hosting before you move more recordings in.
        </p>
        {paidPlans.length === 0 ? (
          <p className="mt-2 text-sm leading-6 text-warning-700">
            Paid plans are not published on this instance yet. Run the pricing setup before enabling upgrades.
          </p>
        ) : null}
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => {
          const Icon = plan.icon;

          return (
            <Card
              key={plan.id}
              variant={plan.featured ? 'tertiary' : 'default'}
              className={`flex h-full flex-col rounded-[1.9rem] border p-6 shadow-none ${
                plan.featured
                  ? 'border-primary/30 bg-background ring-1 ring-primary/20'
                  : 'border-default-200/80 bg-background/90'
              }`}
            >
              <Card.Header className="flex flex-col items-start gap-4 px-0 pt-0">
                <div className="flex w-full items-start justify-between gap-4">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl ${plan.accentClass}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  {plan.badge && (
                    <Chip
                      variant="soft"
                      color={plan.featured ? 'accent' : 'default'}
                      className="rounded-full"
                    >
                      {plan.badge}
                    </Chip>
                  )}
                </div>

                <div className="space-y-2">
                  <h3 className="text-2xl font-bold text-foreground">{plan.name}</h3>
                  <p className="text-sm leading-6 text-default-500">{plan.description}</p>
                </div>

                <div className="flex items-end gap-2">
                  <span className="text-5xl font-black tracking-[-0.05em] text-foreground">
                    {plan.price}
                  </span>
                  {plan.cadence && (
                    <span className="pb-2 text-sm text-default-500">{plan.cadence}</span>
                  )}
                </div>
              </Card.Header>

              <Separator className="my-6" />

              <Card.Content className="flex-1 gap-3 px-0">
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                  Included
                </div>
                {plan.highlights.map((item) => (
                  <div key={item} className="flex items-start gap-3 text-sm leading-6 text-default-600">
                    <Check className="mt-1 h-4 w-4 shrink-0 text-success" />
                    <span>{item}</span>
                  </div>
                ))}
              </Card.Content>

              <Card.Footer className="mt-6 px-0 pb-0">
                {plan.action === 'signup' && (
                  <Link href="/signup" className="w-full">
                    <Button
                      variant={plan.featured ? 'primary' : 'secondary'}
                      className="w-full rounded-full font-semibold"
                    >
                      Start on {plan.name}
                    </Button>
                  </Link>
                )}

                {plan.action === 'checkout' && plan.sourcePlan && (
                  <Button
                    className="w-full rounded-full font-semibold"
                    onPress={() => handleSubscribe(plan.sourcePlan!)}
                    isDisabled={isLoading !== null}
                  >
                    {isLoading === plan.id ? (
                      <>
                        <Spinner size="sm" color="current" />
                        Processing...
                      </>
                    ) : (
                      <>
                        Start on {plan.name}
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                )}

                {plan.action === 'contact' && (
                  <Button
                    variant="secondary"
                    className="w-full rounded-full font-semibold"
                    onPress={() => {
                      window.location.href = `mailto:${salesEmail}`;
                    }}
                  >
                    {plan.ctaLabel}
                  </Button>
                )}
              </Card.Footer>
            </Card>
          );
        })}
      </div>

      <Surface variant="secondary" className="rounded-[1.9rem] border border-default-200/80 p-6 md:p-7">
        <div className="space-y-5">
          <div className="max-w-3xl space-y-3">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
              Compare what changes
            </div>
            <h3 className="text-2xl font-bold tracking-[-0.03em] text-foreground">
              See the differences without flipping between cards.
            </h3>
            <p className="text-sm leading-6 text-default-600">
              Every plan keeps the archive organized. The comparison below shows what grows as you need more room, stronger search, or tighter support.
            </p>
          </div>

          <div className="space-y-3">
            {comparisonRows.map((row) => (
              <div
                key={row.label}
                className="rounded-[1.5rem] border border-default-200/80 bg-background/85 p-4"
              >
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-foreground">{row.label}</div>
                  <p className="text-sm text-default-500">{row.description}</p>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {plans.map((plan) => (
                    <div
                      key={`${row.label}-${plan.id}`}
                      className={`rounded-[1.25rem] border p-3 ${
                        plan.featured
                          ? 'border-primary/20 bg-primary/5'
                          : 'border-default-200/70 bg-default-50/60'
                      }`}
                    >
                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-default-400">
                        {plan.name}
                      </div>
                      <div className="mt-2 text-sm font-medium leading-6 text-foreground">
                        {row.values[plan.id]}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Surface>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr_0.9fr]">
        <Surface variant="secondary" className="rounded-[1.75rem] border border-default-200/80 p-6">
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
              Billing notes
            </div>
            <h3 className="text-xl font-bold text-foreground">
              Start on free, then upgrade only when your archive needs more room.
            </h3>
            <p className="text-sm leading-6 text-default-600">
              You can begin without a credit card. Paid plans move through Stripe checkout when you are ready for more storage, deeper history, or stronger retrieval.
            </p>
          </div>
        </Surface>

        {addOns.map((item) => (
          <Card key={item.title} className="rounded-[1.75rem] border border-default-200/80 p-6">
            <Card.Header className="flex flex-row items-start justify-between gap-4 px-0 pt-0">
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                  Add-on
                </div>
                <h4 className="text-lg font-bold text-foreground">{item.title}</h4>
                <p className="text-sm leading-6 text-default-500">{item.detail}</p>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-2xl font-bold text-foreground">{item.price}</div>
                <div className="text-sm text-default-500">{item.cadence}</div>
              </div>
            </Card.Header>
          </Card>
        ))}
      </div>

      <Surface
        variant="secondary"
        className="rounded-[1.9rem] border border-default-200/80 p-6 md:p-7"
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
              Own your own data
            </div>
            <h3 className="text-2xl font-bold tracking-[-0.03em] text-foreground">
              Keep Callery on your own server when the archive needs private hosting.
            </h3>
            <p className="max-w-3xl text-sm leading-6 text-default-600">
              Individuals can purchase a self-hosted license for{' '}
              <span className="font-semibold text-foreground">$300</span> and keep full control of
              their own recordings, transcripts, and deployment. Teams that want private hosting can
              email us to discuss rollout, setup expectations, and custom pricing.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
            <a href={`mailto:${salesEmail}`} className="w-full">
              <Button className="w-full rounded-full font-semibold">
                Email about private hosting
              </Button>
            </a>
            <div className="text-sm text-default-500 lg:text-right">{salesEmail}</div>
          </div>
        </div>
      </Surface>
    </div>
  );
}
