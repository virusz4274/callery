/** Public pages follow the same explicit billing opt-in as the managed service. */
export const GITHUB_SUPPORT_URL = 'https://github.com/virusz4274/Vosift/issues';

// Keep the direct environment access: Next inlines it in browser bundles.
export function publicSitePolicy() {
    const marketingEnabled = process.env.NEXT_PUBLIC_ENABLE_BILLING === 'true';
    return {
        marketingEnabled,
        supportHref: marketingEnabled ? '/support' : GITHUB_SUPPORT_URL,
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
