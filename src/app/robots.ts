import type { MetadataRoute } from 'next';
import { absoluteUrl, siteOrigin } from '@/lib/seo';
import { publicSitePolicy } from '@/lib/public-site-policy';

export default function robots(): MetadataRoute.Robots {
  if (!publicSitePolicy().marketingEnabled) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin/',
          '/api/',
          '/recordings/',
          '/contacts/',
          '/files/',
          '/settings/',
          '/upload/',
          '/login',
          '/signup',
          '/forgot-password',
          '/reset-password',
          '/maintenance',
          '/android-sync',
          '/~offline',
          '/s/',
        ],
      },
    ],
    host: siteOrigin,
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
