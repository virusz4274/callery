import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth-utils';
import { getRecordingsForApi, countRecordingsByUser } from '@/lib/db/recordings';


/**
 * GET /api/recordings
 * 
 * Fetch all recordings for the authenticated user.
 * Query params:
 * - limit: number (default 100)
 * - skip: number (default 0)
 * - includeArchived: boolean (default false)
 */
export async function GET(request: NextRequest) {
    const firebaseUid = await getUserFromRequest(request);

    if (!firebaseUid) {
        return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
        );
    }

    try {
        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get('limit') || '100', 10);
        const page = parseInt(searchParams.get('page') || '1', 10);
        const includeArchived = searchParams.get('includeArchived') === 'true';

        const skip = (page - 1) * limit;

        const [recordings, totalCount] = await Promise.all([
            getRecordingsForApi(firebaseUid, { limit, skip, includeArchived }),
            countRecordingsByUser(firebaseUid),
        ]);

        return NextResponse.json({
            recordings,
            totalCount,
            page,
            limit
        });
    } catch (error) {
        console.error('Error fetching recordings:', error);
        return NextResponse.json(
            { error: 'Failed to fetch recordings' },
            { status: 500 }
        );
    }
}
