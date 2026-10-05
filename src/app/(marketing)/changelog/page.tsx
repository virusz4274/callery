import type { Metadata } from 'next';
import { ChangelogPage as ChangelogPageContent } from '@/components/pages/changelog-page';
import { JsonLd } from '@/components/seo/json-ld';
import { buildCollectionPageSchema, createMarketingMetadata, jsonLdGraph, siteSeoConfig } from '@/lib/seo';

const changes = [
    {
        version: 'v0.1.0',
        date: 'February 2, 2026',
        publishedAt: '2026-02-02',
        type: 'Beta',
        summary: 'First public beta of the call archive, transcript, and search workspace.',
        items: [
            'Initial beta release',
            'Call recording archive and transcription',
            'Contact management',
            'Semantic search and basic file management',
        ],
    },
];

export const metadata: Metadata = createMarketingMetadata({
  config: siteSeoConfig,
  title: 'Product changelog',
  description:
    'Follow product releases, archive improvements, and search updates.',
  path: '/changelog',
  keywords: ['product changelog', 'call archive release notes', 'call search updates'],
});

export default function ChangelogPage() {
    const jsonLd = jsonLdGraph(
        buildCollectionPageSchema({
            config: siteSeoConfig,
            name: `${siteSeoConfig.siteName} changelog`,
            description: `Release notes and product updates for the ${siteSeoConfig.siteName} workspace.`,
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
