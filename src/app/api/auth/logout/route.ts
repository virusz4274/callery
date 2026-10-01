import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
    (await cookies()).delete('session');
    return NextResponse.json({ status: 'success' }, { status: 200 });
}

export async function GET(request: NextRequest) {
    (await cookies()).delete('session');
    // Redirect home after logout via GET (same origin, never a stale default).
    return NextResponse.redirect(new URL('/', request.nextUrl.origin));
}
