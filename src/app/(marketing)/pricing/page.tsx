export const dynamic = 'force-dynamic';
import type { Metadata } from 'next';
import { getPublishedPlans } from '@/app/actions/plans';
import { PricingSection } from '@/components/pricing-section';
import { JsonLd } from '@/components/seo/json-ld';
import {
  buildOfferSchemas,
  buildSoftwareApplicationSchema,
  createMarketingMetadata,
  jsonLdGraph,
  siteSeoConfig,
} from '@/lib/seo';

export const metadata: Metadata = createMarketingMetadata({
  config: siteSeoConfig,
  title: 'Pricing for call recording archive and AI search',
  description:
    'Compare free, paid, and custom plans for searchable call archives, transcription, and AI retrieval.',
  path: '/pricing',
  keywords: [
    'call archive pricing',
    'call transcript pricing',
    'AI call search pricing',
  ],
});

export default async function PricingPage() {
  const publishedPlans = await getPublishedPlans();
  const jsonLd = jsonLdGraph(
    buildSoftwareApplicationSchema(siteSeoConfig, {
      name: `${siteSeoConfig.siteName} pricing`,
      description:
        'Pricing for searchable call archives with transcription, summaries, and AI search.',
      path: '/pricing',
      offers: buildOfferSchemas(siteSeoConfig, publishedPlans),
    })
  );

  return (
    <div className="relative overflow-hidden">
      <JsonLd data={jsonLd} />


      <section className="border-b border-border">
        <div className="relative mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
          <span className="inline-flex rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
            Pricing
          </span>
          <h1 className="mt-4 max-w-4xl text-2xl font-semibold text-foreground md:text-3xl">
            Compare the free, standard, pro, and custom lanes in one place.
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-muted">
            Start with a lighter archive, then move into the lane that matches your storage,
            transcription, and rollout needs.
          </p>
        </div>
      </section>

      <section className="relative mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
        <PricingSection availablePlans={publishedPlans} salesEmail={siteSeoConfig.salesEmail} />
      </section>
    </div>
  );
}
