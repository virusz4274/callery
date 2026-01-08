import { NextResponse } from 'next/server';


/**
 * The main proxy function.
 * Currently simplified to allow all requests to pass through while authentication is being reworked.
 */
export async function proxy() {
    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public (public files)
         */
        '/((?!_next/static|_next/image|favicon.ico|public).*)',
    ],
};
