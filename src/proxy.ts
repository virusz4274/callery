import { NextResponse, type NextRequest } from 'next/server';
import { getContentSecurityPolicyHeader } from '@/lib/security-headers';
import { getPublicAppOrigin } from '@/lib/public-url';
import { documentationHref, marketingPageHref } from '@/lib/public-site-policy';

const informationPaths = ['/privacy-policy', '/terms-of-service', '/changelog', '/developers'] as const;

/** Storage endpoints are runtime settings, including self-hosted HTTP MinIO. */
export function proxy(request: NextRequest) {
    const path = informationPaths.find(path => path === request.nextUrl.pathname);
    // Fixed destinations never forward app query values or mutation bodies.
    const informationHref = path && ['GET', 'HEAD'].includes(request.method)
        ? marketingPageHref(path) || (path === '/developers' ? documentationHref('integration-api') : null)
        : null;
    // Redirect before the app layout can start streaming its Suspense fallback.
    const response = informationHref
        ? NextResponse.redirect(informationHref, 307)
        : request.nextUrl.pathname === '/'
        ? NextResponse.redirect(new URL(`/recordings${request.nextUrl.search}`, getPublicAppOrigin(request)), 307)
        : NextResponse.next();
    const csp = getContentSecurityPolicyHeader();
    if (csp) response.headers.set(csp.key, csp.value);
    return response;
}

// Keep binary ingestion out of Proxy's request-body cloning/buffering. Global
// response security headers still apply through next.config.ts.
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|api/v1/recordings/?$|api/uploads/content/?$|api/uploads/[^/]+/parts/[^/]+/?$).*)'] };
