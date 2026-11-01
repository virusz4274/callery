import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PricingSection } from '@/components/pricing-section';
import { JsonLd } from '@/components/seo/json-ld';
import { getMarketingPricing } from '@/lib/marketing-pricing-server';
import { publicSitePolicy } from '@/lib/public-site-policy';
import {
  buildOfferSchemas,
  buildSoftwareApplicationSchema,
  createMarketingMetadata,
  jsonLdGraph,
  siteSeoConfig,
} from '@/lib/seo';
import styles from '@/components/marketing/pricing.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = createMarketingMetadata({
  config: siteSeoConfig,
  title: 'Plans and pricing',
  description: 'Compare Callery plans for your recorded calls. See included storage, transcription, and clear usage pricing.',
  path: '/pricing',
  keywords: ['call recording archive pricing', 'call transcription pricing', 'Callery plans'],
});

export default async function PricingPage() {
  if (!publicSitePolicy().marketingEnabled) notFound();
  const pricing = await getMarketingPricing();
  const jsonLd = jsonLdGraph(buildSoftwareApplicationSchema(siteSeoConfig, {
    name: `${siteSeoConfig.siteName} pricing`,
    description: 'Plans for keeping recorded calls organized, transcribed, and searchable.',
    path: '/pricing',
    offers: buildOfferSchemas(siteSeoConfig, pricing),
  }));

  return (
    <div className={styles.page}>
      <JsonLd data={jsonLd} />
      <div className={styles.pageIntro}>
        <h1>A plan for your growing call archive.</h1>
        <p>{pricing.trial
          ? 'Start with your own recordings, free for 30 days. Choose more storage and transcription when you need them.'
          : 'Choose the storage and transcription you need to keep your recorded calls organized and searchable.'}</p>
      </div>
      <PricingSection pricing={pricing} salesEmail={siteSeoConfig.salesEmail} />
    </div>
  );
}
