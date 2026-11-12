import { isIP } from 'node:net';

function configuredOrigin(value: string | undefined, fallback: string, name: string): string {
    const url = new URL(value || fallback);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password
        || url.pathname !== '/' || url.search || url.hash) {
        throw new Error(`${name} must be an HTTP(S) origin without a path or credentials.`);
    }
    return url.origin;
}

const preview = process.env.CF_PAGES === '1' && process.env.CF_PAGES_BRANCH !== 'main';
const launchStage = process.env.SITE_LAUNCH_STAGE ?? 'coming-soon';
if (launchStage !== 'coming-soon' && launchStage !== 'open') {
    throw new Error('SITE_LAUNCH_STAGE must be coming-soon or open.');
}

export const siteConfig = {
    name: 'Callery',
    origin: configuredOrigin(process.env.SITE_URL, 'https://callery.example', 'SITE_URL'),
    appOrigin: configuredOrigin(process.env.PUBLIC_APP_URL, 'https://app.callery.example', 'PUBLIC_APP_URL'),
    indexable: process.env.SITE_INDEXABLE === 'true' && !preview,
    launchStage,
    comingSoon: launchStage === 'coming-soon',
    repositoryUrl: 'https://github.com/virusz4274/callery',
    demoUrl: 'https://www.youtube.com/watch?v=Z4hJoVGuXgw',
} as const;

if (siteConfig.indexable) {
    for (const origin of [siteConfig.origin, siteConfig.appOrigin]) {
        const url = new URL(origin);
        // Public sites are configured with DNS names, never literal service IPs.
        const hostname = url.hostname.replace(/^\[|\]$/g, '');
        if (url.protocol !== 'https:' || isIP(hostname)
            || /(?:^|\.)(?:example|invalid|localhost|test|local)$/.test(hostname)
            || /(?:^|\.)example\.(?:com|org|net)$/.test(hostname)) {
            throw new Error('Indexable website builds require real public HTTPS SITE_URL and PUBLIC_APP_URL origins.');
        }
    }
    if (siteConfig.origin === siteConfig.appOrigin) throw new Error('The website and app must have separate origins.');
}

export function appUrl(path: string): string {
    return new URL(path, siteConfig.appOrigin).toString();
}

export function siteUrl(path: string): string {
    return new URL(path, siteConfig.origin).toString();
}

export function serializeJsonLd(data: unknown): string {
    return JSON.stringify(data).replace(/</g, '\\u003c');
}
