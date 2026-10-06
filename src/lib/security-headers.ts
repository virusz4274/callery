import { env as validatedEnv } from './env';

type EnvPrimitive = string | boolean | number | undefined;

type EnvLike = Partial<typeof validatedEnv> & {
    VERCEL_ENV?: string;
    [key: string]: EnvPrimitive;
};

const DEFAULT_CSP_DIRECTIVES: Record<string, string[]> = {
    defaultSrc: ["'self'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    frameAncestors: ["'none'"],
    scriptSrc: ["'self'", "'unsafe-inline'", 'https://js.stripe.com', 'https://www.gstatic.com', 'https://apis.google.com', 'https://static.cloudflareinsights.com'],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: [
        "'self'",
        "data:",
        "blob:",
        "https://lh3.googleusercontent.com",
        "https://*.googleusercontent.com",
    ],
    connectSrc: [
        "'self'",
        'https://api.stripe.com',
        'https://*.ingest.us.sentry.io',
        'https://www.googleapis.com',
        'https://api.soniox.com',
        'https://api.elevenlabs.io',
        'https://*.r2.cloudflarestorage.com',
    ],
    frameSrc: ['https://js.stripe.com', 'https://hooks.stripe.com'],
    mediaSrc: ["'self'", 'blob:', 'https:'],
    workerSrc: ["'self'", 'blob:'],
};

function normalizeOrigin(value: string | undefined): string | null {
    if (!value?.trim()) {
        return null;
    }

    try {
        return new URL(value).origin;
    } catch {
        return null;
    }
}

function unique(values: string[]): string[] {
    return Array.from(new Set(values));
}

function readBooleanFlag(value: EnvPrimitive): boolean {
    return value === true || value === 'true';
}

export function isCspReportOnlyMode(env: EnvLike = validatedEnv): boolean {
    if (env.NODE_ENV !== 'production') {
        return false;
    }

    if (readBooleanFlag(env.CSP_REPORT_ONLY)) {
        return true;
    }

    return Boolean(env.VERCEL_ENV && env.VERCEL_ENV !== 'production');
}

export function buildContentSecurityPolicy(env: EnvLike = validatedEnv): string {
    const connectSrc = [...DEFAULT_CSP_DIRECTIVES.connectSrc];
    const frameSrc = [...DEFAULT_CSP_DIRECTIVES.frameSrc];
    const mediaSrc = [...DEFAULT_CSP_DIRECTIVES.mediaSrc];
    const storageOrigin = normalizeOrigin(String(env.S3_PUBLIC_ENDPOINT || env.R2_ENDPOINT || ''));
    if (storageOrigin) {
        connectSrc.push(storageOrigin);
        mediaSrc.push(storageOrigin);
    }

    const directives: Array<[string, string[]]> = [
        ['default-src', [...DEFAULT_CSP_DIRECTIVES.defaultSrc]],
        ['object-src', [...DEFAULT_CSP_DIRECTIVES.objectSrc]],
        ['base-uri', [...DEFAULT_CSP_DIRECTIVES.baseUri]],
        ['frame-ancestors', [...DEFAULT_CSP_DIRECTIVES.frameAncestors]],
        ['script-src', [...DEFAULT_CSP_DIRECTIVES.scriptSrc]],
        ['style-src', [...DEFAULT_CSP_DIRECTIVES.styleSrc]],
        ['img-src', [...DEFAULT_CSP_DIRECTIVES.imgSrc]],
        ['connect-src', unique(connectSrc)],
        ['frame-src', unique(frameSrc)],
        ['media-src', unique(mediaSrc)],
        ['worker-src', [...DEFAULT_CSP_DIRECTIVES.workerSrc]],
    ];

    return directives
        .map(([name, values]) => `${name} ${values.join(' ')}`)
        .join('; ');
}

export function getContentSecurityPolicyHeader(
    env: EnvLike = validatedEnv
): { key: 'Content-Security-Policy' | 'Content-Security-Policy-Report-Only'; value: string } | null {
    if (env.NODE_ENV !== 'production') {
        return null;
    }

    return {
        key: isCspReportOnlyMode(env)
            ? 'Content-Security-Policy-Report-Only'
            : 'Content-Security-Policy',
        value: buildContentSecurityPolicy(env),
    };
}
