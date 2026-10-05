import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

async function clearSessionCookie() {
    (await cookies()).delete({
        name: 'session',
        path: '/',
    });
}

export async function POST() {
    await clearSessionCookie();
    return NextResponse.json({ status: 'success' }, { status: 200 });
}

export async function GET(request: NextRequest) {
    await clearSessionCookie();
    // Redirect to login or home page after logout via GET
    return NextResponse.redirect(new URL('/', request.url));
}
