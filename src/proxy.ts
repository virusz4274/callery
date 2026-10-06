import { NextResponse } from 'next/server';
import { getContentSecurityPolicyHeader } from '@/lib/security-headers';

/** Storage endpoints are runtime settings, including self-hosted HTTP MinIO. */
export function proxy() {
    const response = NextResponse.next();
    const csp = getContentSecurityPolicyHeader();
    if (csp) response.headers.set(csp.key, csp.value);
    return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
