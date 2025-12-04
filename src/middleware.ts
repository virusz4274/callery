
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirebaseAdminApp } from './firebase/admin';

// Initialize the Firebase Admin App
getFirebaseAdminApp();

// Define public paths that do not require authentication
const PUBLIC_PATHS = [
  '/',
  '/login',
  '/signup',
  '/terms-of-service',
  '/privacy-policy',
];

// Define paths that are used for authentication and should not be redirected
const AUTH_PATHS = ['/api/auth/google/callback'];

/**
 * The main middleware function that handles authentication and authorization.
 * It checks for a valid session cookie and redirects to the login page if
 * the user is not authenticated and trying to access a protected route.
 * @param request The incoming request.
 * @returns A NextResponse object that either continues the request or redirects.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow requests to public paths, authentication paths, and Next.js specific paths
  if (
    PUBLIC_PATHS.includes(pathname) ||
    AUTH_PATHS.some(p => pathname.startsWith(p)) ||
    pathname.startsWith('/_next/')
  ) {
    return NextResponse.next();
  }

  // Check for the session cookie
  const sessionCookie = request.cookies.get('session')?.value;
  if (!sessionCookie) {
    // If no session cookie, redirect to the login page, preserving the original path
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  try {
    // Verify the session cookie with Firebase Admin
    await getAuth().verifySessionCookie(sessionCookie, true);

    // If the cookie is valid, proceed with the request and pass the session cookie
    // in the request headers so it can be accessed in Server Actions.
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-session-cookie', sessionCookie);

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  } catch (error) {
    // If cookie verification fails, redirect to login and clear the invalid cookie
    console.error('Error verifying session cookie in middleware:', error);
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    const response = NextResponse.redirect(url);
    response.cookies.set('session', '', { maxAge: 0 });
    return response;
  }
}

// Configure the middleware to run on all paths except for static files
export const config = {
  matcher: [
    '/((?!_next/static|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
