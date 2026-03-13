import { PricingSection } from "@/components/pricing-section";
import { Chip } from "@heroui/react";
import { getPublishedPlans } from "@/app/actions/plans";

export default async function PricingPage() {
    const publishedPlans = await getPublishedPlans();

    return (
        <div className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(circle_at_top,rgba(38,132,255,0.16),transparent_42%),radial-gradient(circle_at_top_right,rgba(13,148,136,0.12),transparent_30%)]" />

            <section className="border-b border-default-100/80">
                <div className="relative mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
                    <Chip variant="soft" color="accent" className="rounded-full px-3 py-1 text-xs font-medium">
                        Pricing
                    </Chip>
                    <h1 className="mt-4 max-w-4xl text-4xl font-black tracking-[-0.05em] text-foreground md:text-6xl">
                        Plans for personal archives, active review teams, and larger deployments.
                    </h1>
                    <p className="mt-4 max-w-2xl text-lg leading-8 text-default-600">
                        Keep the entry cost low, then scale when storage, transcription volume, and collaboration become part of the daily workflow.
                    </p>
                </div>
            </section>

            <section className="relative mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
                <PricingSection availablePlans={publishedPlans} />
            </section>
        </div>
    );
}
