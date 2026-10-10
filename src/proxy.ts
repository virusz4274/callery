import { NextResponse } from 'next/server';
import { getContentSecurityPolicyHeader } from '@/lib/security-headers';

/** Storage endpoints are runtime settings, including self-hosted HTTP MinIO. */
export function proxy() {
    const response = NextResponse.next();
    const csp = getContentSecurityPolicyHeader();
    if (csp) response.headers.set(csp.key, csp.value);
    return response;
}

// Keep binary ingestion out of Proxy's request-body cloning/buffering. Global
// response security headers still apply through next.config.ts.
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|api/v1/recordings/?$).*)'] };
