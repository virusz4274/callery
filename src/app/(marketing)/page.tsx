export const dynamic = 'force-dynamic';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { publicSitePolicy, workspaceHomeHref } from '@/lib/public-site-policy';
import { HomepageRedirect } from '@/components/marketing/homepage-redirect';
import { JsonLd } from '@/components/seo/json-ld';
import { LandingPage } from '@/components/pages/landing-page';
import {
  buildFaqPageSchema,
  buildOrganizationSchema,
  buildSoftwareApplicationSchema,
  createMarketingMetadata,
  jsonLdGraph,
  siteSeoConfig,
} from '@/lib/seo';
import { landingPageFaqs, landingPageFeatureList } from '@/components/pages/landing-page-content';

export const metadata: Metadata = createMarketingMetadata({
  config: siteSeoConfig,
  title: 'Find the details in your recorded calls',
  description:
    'Bring your recorded calls together with transcripts, summaries, and search. Find what was said and return to the original audio with Callery.',
  path: '/',
  keywords: [
    'call recording archive',
    'Samsung call recording search',
    'call transcript search',
    'AI call archive',
    'folder-based call recordings',
  ],
});

export default async function Home({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!publicSitePolicy().marketingEnabled) {
    redirect(workspaceHomeHref(await searchParams));
  }
  const jsonLd = jsonLdGraph(
    buildOrganizationSchema(siteSeoConfig),
    buildSoftwareApplicationSchema(siteSeoConfig, {
      name: siteSeoConfig.siteName,
      description:
        'Organize existing phone call recordings, review transcripts and summaries, and find the details with search.',
      path: '/',
      featureList: landingPageFeatureList,
    }),
    buildFaqPageSchema(landingPageFaqs)
  );

  return (
    <>
      <JsonLd data={jsonLd} />
      <Suspense>
        <HomepageRedirect />
      </Suspense>
      <LandingPage />
    </>
  );
}
