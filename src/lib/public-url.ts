type RequestLike = {
    headers: Headers;
    nextUrl?: URL;
    url?: string;
};

const DEFAULT_LOCAL_ORIGIN = 'http://localhost:9000';

function normalizeOrigin(value: string | null | undefined): string | null {
    if (!value) {
        return null;
    }

    try {
        return new URL(value).origin;
    } catch {
        return null;
    }
}

function getFirstHeaderValue(headers: Headers, name: string): string | null {
    const rawValue = headers.get(name);
    if (!rawValue) {
        return null;
    }

    const firstValue = rawValue.split(',')[0]?.trim();
    return firstValue || null;
}

export function getPublicAppOrigin(request?: RequestLike): string {
    const configuredOrigin =
        normalizeOrigin(process.env.APP_URL) ||
        normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL);

    if (configuredOrigin) {
        return configuredOrigin;
    }

    if (request) {
        const forwardedHost = getFirstHeaderValue(request.headers, 'x-forwarded-host');
        const host = forwardedHost || getFirstHeaderValue(request.headers, 'host');
        const forwardedProto = getFirstHeaderValue(request.headers, 'x-forwarded-proto');
        const requestProto =
            request.nextUrl?.protocol.replace(':', '') ||
            (request.url ? new URL(request.url).protocol.replace(':', '') : null) ||
            'http';

        if (host) {
            return `${forwardedProto || requestProto}://${host}`;
        }

        if (request.nextUrl?.origin) {
            return request.nextUrl.origin;
        }

        if (request.url) {
            return new URL(request.url).origin;
        }
    }

    return DEFAULT_LOCAL_ORIGIN;
}

export function getConfiguredPublicAppOrigin(): string {
    const configuredOrigin =
        normalizeOrigin(process.env.APP_URL) ||
        normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL);

    if (configuredOrigin) {
        return configuredOrigin;
    }

    if (process.env.NODE_ENV !== 'production') {
        return DEFAULT_LOCAL_ORIGIN;
    }

    throw new Error('Missing APP_URL or NEXT_PUBLIC_APP_URL for public link generation');
}

export function buildAppUrl(pathname: string, request?: RequestLike): URL {
    return new URL(pathname, getPublicAppOrigin(request));
}
