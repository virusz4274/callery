import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth-utils';
import { getDashboardStats } from '@/lib/db/recordings';

/**
 * GET /api/stats
 * 
 * Fetch dashboard statistics for the authenticated user.
 */
export async function GET(request: NextRequest) {
    const authSubject = await getUserFromRequest(request);

    if (!authSubject) {
        return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
        );
    }

    try {
        const stats = await getDashboardStats(authSubject);
        return NextResponse.json(stats);
    } catch (error) {
        console.error('Error fetching stats:', error);
        return NextResponse.json(
            { error: 'Failed to fetch statistics' },
            { status: 500 }
        );
    }
}
