import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { publicSitePolicy } from '@/lib/public-site-policy';
import { ChangelogPage as ChangelogPageContent } from '@/components/pages/changelog-page';
import { JsonLd } from '@/components/seo/json-ld';
import { buildCollectionPageSchema, createMarketingMetadata, jsonLdGraph, siteSeoConfig } from '@/lib/seo';

const changes = [
    {
        version: 'v0.1.0',
        date: 'February 2, 2026',
        publishedAt: '2026-02-02',
        type: 'Beta',
        summary: 'The first public beta of Callery brings call recording archives, transcription, and search together.',
        items: [
            'Call recording archive and transcription',
            'Contact management',
            'Semantic search',
            'Basic file management',
        ],
    },
];

export const metadata: Metadata = createMarketingMetadata({
  config: siteSeoConfig,
  title: 'Product updates',
  description:
    'Read Callery release notes for recording archives, transcription, contacts, and search.',
  path: '/changelog',
  keywords: ['product changelog', 'call archive release notes', 'call search updates'],
});

export default function ChangelogPage() {
    if (!publicSitePolicy().marketingEnabled) notFound();
    const jsonLd = jsonLdGraph(
        buildCollectionPageSchema({
            config: siteSeoConfig,
            name: `${siteSeoConfig.siteName} product updates`,
            description: `Release notes for ${siteSeoConfig.siteName} recording archives, transcription, contacts, and search.`,
            path: '/changelog',
            items: changes.map((change) => ({
                name: change.version,
                description: change.summary,
                datePublished: change.publishedAt,
            })),
        })
    );

    return (
        <>
            <JsonLd data={jsonLd} />
            <ChangelogPageContent changes={changes} />
        </>
    );
}
