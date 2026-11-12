import { siteConfig, siteUrl } from '../lib/site';

export function GET() {
    return new Response(siteConfig.indexable
        ? `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl('/sitemap-index.xml')}\n`
        : 'User-agent: *\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
