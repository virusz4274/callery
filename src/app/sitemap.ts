import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/seo';
import { publicSitePolicy } from '@/lib/public-site-policy';

export default function sitemap(): MetadataRoute.Sitemap {
  if (!publicSitePolicy().marketingEnabled) return [];
  const lastModified = new Date();

  return [
    {
      url: absoluteUrl('/'),
      lastModified,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: absoluteUrl('/pricing'),
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: absoluteUrl('/support'),
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: absoluteUrl('/changelog'),
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: absoluteUrl('/privacy-policy'),
      lastModified: new Date('2023-10-26'),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: absoluteUrl('/terms-of-service'),
      lastModified: new Date('2023-10-26'),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];
}
