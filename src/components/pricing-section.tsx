'use client';

import { Button, Card, Separator, Spinner } from "@heroui/react";
import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/toast-provider";
import { useRouter, useSearchParams } from "next/navigation";
import { authFetch } from "@/lib/api-client";

// Use a known plan name that matches your DB Plan 'name' field
const PRO_PLAN_NAME = 'Pro';

const BILLING_ENABLED = process.env.NEXT_PUBLIC_ENABLE_BILLING === 'true';

export function PricingSection() {
    const { toast } = useToast();
    const router = useRouter();
    const [isLoading, setIsLoading] = useState<string | null>(null);

    // Self-hosted mode: no plans to sell. The dedicated /pricing page renders
    // its own notice; embedded uses (landing page) render nothing.
    const searchParams = useSearchParams();
    const handledCanceled = useRef(false);
    useEffect(() => {
        if (handledCanceled.current || searchParams.get('canceled') !== 'true') return;
        handledCanceled.current = true;
        toast({ title: 'Checkout canceled', description: 'No changes were made to your subscription.', status: 'warning' });
        router.replace('/pricing', { scroll: false });
    }, [searchParams, router, toast]);

    if (!BILLING_ENABLED) return null;



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
                window.location.assign(url);
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
        <div className="space-y-12">
            <div className="text-center">
                <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Find the plan that&apos;s right for you</h2>
                <p className="text-default-500 text-lg mt-4">Simple, transparent pricing. No credit card required to start.</p>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                <Card className="bg-card/70 backdrop-blur-xl border border-default-200">
                    <Card.Header className="flex flex-col items-start gap-1 pb-2">
                        <h3 className="text-xl font-bold">Free</h3>
                        <p className="text-small text-default-500">For individuals just getting started.</p>
                    </Card.Header>
                    <Separator />
                    <Card.Content className="gap-4">
                        <div className="text-4xl font-bold">$0<span className="text-xl font-normal text-muted-foreground">/mo</span></div>
                        <ul className="space-y-2">
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> 100 MB Storage</li>
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Basic Transcription</li>
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Community Support</li>
                        </ul>
                    </Card.Content>
                    <Card.Footer>
                        <Button variant="secondary" className="w-full" onPress={() => router.push('/signup')}>Get Started</Button>
                    </Card.Footer>
                </Card>
                <Card className="bg-card/70 backdrop-blur-xl border-primary border-2 shadow-lg scale-105 z-10">
                    <Card.Header className="flex flex-col items-start gap-1 pb-2">
                        <h3 className="text-xl font-bold text-primary">Pro</h3>
                        <p className="text-small text-default-500">For professionals who need more power.</p>
                    </Card.Header>
                    <Separator />
                    <Card.Content className="gap-4">
                        <div className="text-4xl font-bold">$29<span className="text-xl font-normal text-muted-foreground">/mo</span></div>
                        <ul className="space-y-2">
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> 10 GB Storage</li>
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Advanced AI Transcription</li>
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Priority Email Support</li>
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Data Export</li>
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Detailed Analytics</li>
                        </ul>
                    </Card.Content>
                    <Card.Footer>
                        <Button
                            variant="primary"
                            className="w-full shadow-lg"
                            onPress={() => handleSubscribe(PRO_PLAN_NAME)}
                            isDisabled={isLoading !== null}
                        >
                            {isLoading === PRO_PLAN_NAME ? <><Spinner size="sm" color="current" /> Processing...</> : 'Upgrade to Pro'}
                        </Button>
                    </Card.Footer>
                </Card>
                <Card className="bg-card/70 backdrop-blur-xl border border-default-200">
                    <Card.Header className="flex flex-col items-start gap-1 pb-2">
                        <h3 className="text-xl font-bold">Enterprise</h3>
                        <p className="text-small text-default-500">For teams and businesses with custom needs.</p>
                    </Card.Header>
                    <Separator />
                    <Card.Content className="gap-4">
                        <div className="text-4xl font-bold">Custom</div>
                        <ul className="space-y-2">
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Everything in Pro</li>
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Unlimited Storage</li>
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Team Collaboration</li>
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Dedicated Account Manager</li>
                            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Custom Integrations</li>
                        </ul>
                    </Card.Content>
                    <Card.Footer>
                        <Button variant="secondary" className="w-full" onPress={() => window.location.assign('mailto:sales@vosift.com')}>Contact Sales</Button>
                    </Card.Footer>
                </Card>
            </div>

            <div className="space-y-6">
                <div className="text-center">
                    <h3 className="text-2xl font-bold tracking-tight">Pay-as-you-go Add-ons</h3>
                    <p className="text-muted-foreground mt-1">Scale your features as you need them. Billed based on usage if you enable Overage.</p>
                </div>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <Card className="bg-card/70 backdrop-blur-xl border border-default-200">
                        <Card.Header className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <div>
                                <h4 className="text-lg font-bold">Advanced AI Transcription</h4>
                                <p className="text-small text-default-500">High-accuracy transcription powered by leading AI models.</p>
                            </div>
                            <div className="text-right">
                                <p className="text-2xl font-bold">$0.05</p>
                                <p className="text-small text-muted-foreground">/ minute</p>
                            </div>
                        </Card.Header>
                    </Card>
                    <Card className="bg-card/70 backdrop-blur-xl border border-default-200">
                        <Card.Header className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <div>
                                <h4 className="text-lg font-bold">Additional Storage</h4>
                                <p className="text-small text-default-500">Add more storage space to your plan as your library grows.</p>
                            </div>
                            <div className="text-right">
                                <p className="text-2xl font-bold">$2</p>
                                <p className="text-small text-muted-foreground">/ GB / month</p>
                            </div>
                        </Card.Header>
                    </Card>
                </div>
            </div>
        </div>
    );
}
