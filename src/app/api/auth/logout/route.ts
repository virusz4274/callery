import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
    (await cookies()).delete('session');
    return NextResponse.json({ status: 'success' }, { status: 200 });
}

export async function GET() {
    (await cookies()).delete('session');
    // Redirect to login or home page after logout via GET
    return NextResponse.redirect(new URL('/', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'));
}
