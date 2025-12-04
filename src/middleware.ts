import { NextResponse, type NextRequest } from 'next/server';

// This middleware is essential for Server Actions that need access to the user's session.
// It retrieves the session cookie from the request and forwards it in a request header.
// This allows server-side code (like our `saveContactsToFirestore` action) to securely
// identify the authenticated user without needing the client to send the user ID.
export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const sessionCookie = request.cookies.get('session');
  
  if (sessionCookie) {
    response.headers.set('x-session-cookie', sessionCookie.value);
  }

  return response;
}

export const config = {
  // This matcher ensures the middleware runs on all paths,
  // making the user session available to all Server Actions.
  matcher: '/:path*',
};
