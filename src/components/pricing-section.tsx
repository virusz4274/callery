'use client';

import Link from 'next/link';
import { Button, Card, Chip, Separator, Spinner, Surface } from "@heroui/react";
import { ArrowRight, Building2, Check, Rocket, Sparkles } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/components/toast-provider";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/api-client";
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

const SELF_HOST_EMAIL = 'sales@vosift.com';

type PricingSectionProps = {
    availablePlans?: PublicPlan[];
};

function formatCadence(interval: PublicPlan['interval']) {
    if (interval === 'monthly') {
        return '/month';
    }

    if (interval === 'yearly') {
        return '/year';
    }

    return '';
}

export function PricingSection({ availablePlans = [] }: PricingSectionProps) {
    const { toast } = useToast();
    const router = useRouter();
    const [isLoading, setIsLoading] = useState<string | null>(null);
    const featuredPaidPlan =
        availablePlans.find((plan) => plan.interval !== 'lifetime') ??
        availablePlans[0] ??
        null;
    const featuredPlanName = featuredPaidPlan?.name ?? 'Pro';

    const plans = [
        {
            name: 'Free',
            price: '$0',
            cadence: '/month',
            description: 'For individuals proving out the workflow on a smaller archive.',
            highlights: [
                '100 MB storage',
                'Basic transcription',
                'Search across your transcript library',
                'A clean starting point for personal or occasional call archives',
            ],
            icon: Rocket,
            accentClass: 'bg-default-100 text-foreground',
        },
        {
            name: featuredPlanName,
            price: featuredPaidPlan ? `$${featuredPaidPlan.price}` : '$29',
            cadence: featuredPaidPlan ? formatCadence(featuredPaidPlan.interval) : '/month',
            description:
                featuredPaidPlan?.description ||
                'For individuals and small teams that keep recordings as important records.',
            highlights:
                featuredPaidPlan?.features?.length
                    ? featuredPaidPlan.features
                    : [
                          '10 GB storage',
                          'Advanced AI transcription',
                          'Summary, speaker labels, and semantic search',
                          'Priority email support',
                          'Best fit for active business archives',
                      ],
            icon: Sparkles,
            accentClass: 'bg-primary/10 text-primary',
            featured: true,
        },
        {
            name: 'Enterprise',
            price: 'Custom',
            cadence: '',
            description: 'For firms and teams that need custom storage, controls, or rollout support.',
            highlights: [
                `Everything in ${featuredPlanName}`,
                'Large or unlimited storage options',
                'Support for shared business archives',
                'Dedicated account coverage',
                'Custom integrations and controls',
            ],
            icon: Building2,
            accentClass: 'bg-secondary/10 text-secondary',
        },
    ];

    const handleSubscribe = async (planName: string) => {
        setIsLoading(planName);
        try {
            const response = await authFetch('/api/stripe/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    planName: planName, // API will look up the priceId
                    successUrl: `${window.location.origin}/settings?success=true`,
                    cancelUrl: `${window.location.origin}/pricing?canceled=true`,
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
            if (url) {
                window.location.href = url;
            } else {
                throw new Error('No checkout URL returned');
            }
        } catch (error) {
            console.error('Checkout error:', error);
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Something went wrong",
                status: "danger",
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
                    Plans that scale from a personal archive to a shared business call library.
                </h2>
                <p className="mt-4 text-lg leading-8 text-default-600">
                    Start small, then grow when storage, transcript volume, and shared access become
                    part of how you keep important recordings.
                </p>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.1fr_0.95fr]">
                {plans.map((plan) => {
                    const Icon = plan.icon;

                    return (
                        <Card
                            key={plan.name}
                            variant={plan.featured ? 'tertiary' : 'default'}
                            className={`rounded-[1.9rem] border p-6 shadow-none ${
                                plan.featured
                                    ? 'border-primary/30 bg-background ring-1 ring-primary/20'
                                    : 'border-default-200/80 bg-background/90'
                            }`}
                        >
                            <Card.Header className="flex flex-col items-start gap-4 px-0 pt-0">
                                <div className="flex w-full items-start justify-between gap-4">
                                    <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${plan.accentClass}`}>
                                        <Icon className="h-5 w-5" />
                                    </div>
                                    {plan.featured && (
                                        <Chip variant="soft" color="accent" className="rounded-full">
                                            Most popular
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

                            <Card.Content className="gap-3 px-0">
                                {plan.highlights.map((item) => (
                                    <div key={item} className="flex items-start gap-3 text-sm leading-6 text-default-600">
                                        <Check className="mt-1 h-4 w-4 shrink-0 text-success" />
                                        <span>{item}</span>
                                    </div>
                                ))}
                            </Card.Content>

                            <Card.Footer className="mt-6 px-0 pb-0">
                                {plan.name === 'Free' && (
                                    <Link href="/signup" className="w-full">
                                        <Button variant="secondary" className="w-full rounded-full font-semibold">
                                            Start free
                                        </Button>
                                    </Link>
                                )}

                                {plan.name === featuredPlanName && (
                                    <Button
                                        className="w-full rounded-full font-semibold"
                                        onPress={() => handleSubscribe(featuredPlanName)}
                                        isDisabled={isLoading !== null}
                                    >
                                        {isLoading === featuredPlanName ? (
                                            <>
                                                <Spinner size="sm" color="current" />
                                                Processing...
                                            </>
                                        ) : (
                                            <>
                                                {featuredPaidPlan ? `Upgrade to ${featuredPlanName}` : 'Upgrade plan'}
                                                <ArrowRight className="h-4 w-4" />
                                            </>
                                        )}
                                    </Button>
                                )}

                                {plan.name === 'Enterprise' && (
                                    <Button
                                        variant="secondary"
                                        className="w-full rounded-full font-semibold"
                                        onPress={() => {
                                            window.location.href = 'mailto:sales@vosift.com';
                                        }}
                                    >
                                        Contact sales
                                    </Button>
                                )}
                            </Card.Footer>
                        </Card>
                    );
                })}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.05fr_0.95fr_0.95fr]">
                <Surface variant="secondary" className="rounded-[1.75rem] border border-default-200/80 p-6">
                    <div className="space-y-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
                            Billing notes
                        </div>
                        <h3 className="text-xl font-bold text-foreground">Start small, then grow when the archive becomes essential.</h3>
                        <p className="text-sm leading-6 text-default-600">
                            The pricing model is set up so people can validate organization,
                            transcript quality, and search before they commit to larger storage or transcription usage.
                        </p>
                        <p className="text-sm leading-6 text-default-600">
                            No credit card is required to start on the free plan. Upgrades route through Stripe checkout when you are ready.
                        </p>
                    </div>
                </Surface>

                {addOns.map((item) => (
                    <Card key={item.title} className="rounded-[1.75rem] border border-default-200/80 p-6">
                        <Card.Header className="flex flex-row items-start justify-between gap-4 px-0 pt-0">
                            <div className="space-y-2">
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
                            Keep VoSift on your own private server.
                        </h3>
                        <p className="max-w-3xl text-sm leading-6 text-default-600">
                            Individuals can purchase a self-hosted license for <span className="font-semibold text-foreground">$300</span> and keep full control of their own recordings, transcripts, and deployment.
                            Teams that want private hosting can email us to discuss custom pricing, setup, and deployment expectations.
                        </p>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                        <a href={`mailto:${SELF_HOST_EMAIL}`} className="w-full">
                            <Button className="w-full rounded-full font-semibold">
                                Email about private hosting
                            </Button>
                        </a>
                        <div className="text-sm text-default-500 lg:text-right">
                            {SELF_HOST_EMAIL}
                        </div>
                    </div>
                </div>
            </Surface>
        </div>
    );
}
