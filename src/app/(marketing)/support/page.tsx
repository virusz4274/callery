import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { publicSitePolicy } from '@/lib/public-site-policy';
import { SupportPage as SupportPageContent } from '@/components/pages/support-page';
import { JsonLd } from '@/components/seo/json-ld';
import { buildContactPageSchema, createMarketingMetadata, jsonLdGraph, siteSeoConfig } from '@/lib/seo';

export const metadata: Metadata = createMarketingMetadata({
  config: siteSeoConfig,
  title: 'Support for call archive and search',
  description:
    'Contact support for archive imports, Samsung call recording workflows, billing questions, and product feedback.',
  path: '/support',
  keywords: ['support', 'call archive support', 'Samsung call recording help'],
});

export default function SupportPage() {
  const policy = publicSitePolicy();
  if (!policy.marketingEnabled) redirect(policy.supportHref);
  const jsonLd = jsonLdGraph(
    buildContactPageSchema(siteSeoConfig, {
      name: `${siteSeoConfig.siteName} support`,
      description:
        'Support page for customers who need help with call recording imports, billing, and archive workflows.',
    })
  );

  return (
    <>
      <JsonLd data={jsonLd} />
      <SupportPageContent supportEmail={siteSeoConfig.supportEmail} />
    </>
  );
}
