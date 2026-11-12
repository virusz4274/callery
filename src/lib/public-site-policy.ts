import { publicEnv } from './public-env';

export const GITHUB_SUPPORT_URL = 'https://github.com/virusz4274/callery/issues';

const documentationSlugs = ['setup-guide', 'user-guide', 'small-team-setup', 'transcription-batches', 'api-reference', 'integration-api', 'mcp-platforms', 'recording-filenames', 'releases'] as const;
type DocumentationSlug = typeof documentationSlugs[number];
const marketingPaths = ['/', '/privacy-policy', '/terms-of-service', '/changelog', '/developers',
    ...documentationSlugs.map(slug => `/docs/${slug}` as const)] as const;
type MarketingPath = typeof marketingPaths[number];

/** Only a configured origin and known information paths may leave this instance. */
export function marketingPageHref(path: MarketingPath): string | null {
    if (!marketingPaths.includes(path) || !publicEnv.NEXT_PUBLIC_MARKETING_URL) return null;
    try {
        const url = new URL(publicEnv.NEXT_PUBLIC_MARKETING_URL);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
            || url.pathname !== '/' || url.search || url.hash) return null;
        // A mistaken app-origin setting must not loop legal-page redirects.
        if (publicEnv.NEXT_PUBLIC_APP_URL && url.origin === new URL(publicEnv.NEXT_PUBLIC_APP_URL).origin) return null;
        return new URL(path, url.origin).toString();
    } catch {
        return null;
    }
}

/** Public documentation lives on the website, with a useful self-host fallback. */
export function documentationHref(slug: DocumentationSlug): string {
    if (!documentationSlugs.includes(slug)) throw new RangeError('Unknown documentation page.');
    return marketingPageHref(`/docs/${slug}`)
        || `https://github.com/virusz4274/callery/blob/main/docs/${slug}.md`;
}

/** Managed account services and a separate public website are independent. */
export function publicSitePolicy() {
    const managedEnabled = publicEnv.NEXT_PUBLIC_ENABLE_BILLING;
    return {
        managedEnabled,
        supportHref: managedEnabled ? '/support' : GITHUB_SUPPORT_URL,
        marketingHref: marketingPageHref('/'),
    };
}

/** Preserve repeated and empty query values when entering the self-host workspace. */
export function workspaceHomeHref(searchParams: Record<string, string | string[] | undefined>): string {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
        if (value === undefined) continue;
        for (const item of Array.isArray(value) ? value : [value]) query.append(key, item);
    }
    const search = query.toString();
    return search ? `/recordings?${search}` : '/recordings';
}
