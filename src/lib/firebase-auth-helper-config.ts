import { env as validatedEnv } from '@/lib/env';

type EnvLike = Partial<typeof validatedEnv> & Record<string, string | undefined>;

const DEFAULT_CSP_DIRECTIVES: Record<string, string[]> = {
    defaultSrc: ["'self'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    frameAncestors: ["'none'"],
    scriptSrc: ["'self'", "'unsafe-inline'", 'https://js.stripe.com', 'https://www.gstatic.com'],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'blob:', 'https://images.unsplash.com', 'https://placehold.co'],
    connectSrc: [
        "'self'",
        'https://api.stripe.com',
        'https://*.ingest.us.sentry.io',
        'https://identitytoolkit.googleapis.com',
        'https://securetoken.googleapis.com',
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

export function getFirebaseAuthHelperOrigin(env: EnvLike = validatedEnv): string | null {
    const explicitOrigin = normalizeOrigin(env.FIREBASE_AUTH_HELPER_ORIGIN);
    if (explicitOrigin) {
        return explicitOrigin;
    }

    const authDomain = env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim();
    if (!authDomain) {
        return null;
    }

    if (/^https?:\/\//i.test(authDomain)) {
        return normalizeOrigin(authDomain);
    }

    return normalizeOrigin(`https://${authDomain}`);
}

export function shouldWarnAboutMissingFirebaseAuthHelper(env: EnvLike = validatedEnv): boolean {
    const isUsingFirebase = Boolean(
        env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim()
        || env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim()
    );

    return isUsingFirebase && !getFirebaseAuthHelperOrigin(env);
}

export function isCspReportOnlyMode(env: EnvLike = validatedEnv): boolean {
    if (env.NODE_ENV !== 'production') {
        return false;
    }

    if (env.CSP_REPORT_ONLY === 'true') {
        return true;
    }

    return Boolean(env.VERCEL_ENV && env.VERCEL_ENV !== 'production');
}

export function buildContentSecurityPolicy(env: EnvLike = validatedEnv): string {
    const helperOrigin = getFirebaseAuthHelperOrigin(env);
    const connectSrc = [...DEFAULT_CSP_DIRECTIVES.connectSrc];
    const frameSrc = [...DEFAULT_CSP_DIRECTIVES.frameSrc];

    if (helperOrigin) {
        connectSrc.push(helperOrigin);
        frameSrc.push(helperOrigin);
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
        ['media-src', [...DEFAULT_CSP_DIRECTIVES.mediaSrc]],
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
