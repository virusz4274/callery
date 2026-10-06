import { getAuthCapabilities } from '@/lib/auth/config';

export const dynamic = 'force-dynamic';

export function GET() {
    const headers = { 'Cache-Control': 'no-store' };
    try {
        return Response.json(getAuthCapabilities(), { headers });
    } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : 'Invalid authentication configuration.' }, { status: 503, headers });
    }
}
