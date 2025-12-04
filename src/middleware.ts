
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// NOTE: No firebase-admin imports are needed here anymore.

// Define public paths that do not require authentication
const PUBLIC_PATHS = [
  '/login',
  '/signup',
  '/', // The landing page should be public
  '/terms-of-service',
  '/privacy-policy',
];

// Define paths that are used for authentication callbacks
const AUTH_PATHS = ['/api/auth/google/callback'];

/**
 * The main middleware function that handles authentication and authorization.
 * It checks for a session cookie and passes it to server components/actions.
 * It redirects to login for protected routes if no cookie is found.
 * @param request The incoming request.
 * @returns A NextResponse object that either continues the request or redirects.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get('session')?.value;

  // Allow requests to Next.js specific paths
  if (pathname.startsWith('/_next/') || pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // If the user is trying to access a public page, let them through.
  // Exception: if they are logged in, redirect from landing page to dashboard.
  if (PUBLIC_PATHS.includes(pathname) || pathname.startsWith('/#')) {
      // The root path '/' is special. If the user is logged in and tries to
      // access the landing page, we should redirect them to their dashboard.
      // For now, we'll let all public paths through. A future improvement
      // could be to check the cookie and redirect from '/'.
      return NextResponse.next();
  }
  
  // For all other "protected" routes, check for a session cookie.
  if (!sessionCookie) {
    // If no session cookie, redirect to the login page, preserving the original path
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  // If a session cookie exists, we'll assume it's valid for now and let the 
  // server actions/components verify it as needed.
  // We pass the cookie in the request headers so it can be accessed in Server Actions.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-session-cookie', sessionCookie);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

// Configure the middleware to run on all paths except for static files
export const config = {
  matcher: [
    '/((?!_next/static|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
