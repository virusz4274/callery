export const dynamic = 'force-dynamic';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { publicSitePolicy, workspaceHomeHref } from '@/lib/public-site-policy';
import { getPublishedPlans } from '@/app/actions/plans';
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
  title: 'Call recording archive and AI search for Samsung and folder-based recordings',
  description:
    'Archive call recordings from Samsung devices and other phones that save audio into folders, then search them with transcripts, summaries, timestamps, and AI retrieval.',
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
  const publishedPlans = await getPublishedPlans();
  const jsonLd = jsonLdGraph(
    buildOrganizationSchema(siteSeoConfig),
    buildSoftwareApplicationSchema(siteSeoConfig, {
      name: siteSeoConfig.siteName,
      description:
        'A searchable call recording archive for Samsung users and anyone who stores call audio in folders.',
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
      <LandingPage availablePlans={publishedPlans} salesEmail={siteSeoConfig.salesEmail} />
    </>
  );
}
