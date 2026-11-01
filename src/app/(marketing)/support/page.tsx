import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { publicSitePolicy } from '@/lib/public-site-policy';
import { SupportPage as SupportPageContent } from '@/components/pages/support-page';
import { JsonLd } from '@/components/seo/json-ld';
import { buildContactPageSchema, createMarketingMetadata, jsonLdGraph, siteSeoConfig } from '@/lib/seo';

export const metadata: Metadata = createMarketingMetadata({
  config: siteSeoConfig,
  title: 'Help and support',
  description:
    'Contact Callery support for help importing recordings, managing your account, and understanding plans and billing.',
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
        'Get help importing recordings, managing your Callery account, and understanding plans and billing.',
    })
  );

  return (
    <>
      <JsonLd data={jsonLd} />
      <SupportPageContent supportEmail={siteSeoConfig.supportEmail} />
    </>
  );
}
