import { NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/mongodb';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Process and database readiness; does not expose configuration or user data. */
export async function GET() {
    try {
        const db = await getMongoDb();
        await db.command({ ping: 1 });
        return NextResponse.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
    } catch {
        return NextResponse.json(
            { status: 'unavailable' },
            { status: 503, headers: { 'Cache-Control': 'no-store' } },
        );
    }
}
