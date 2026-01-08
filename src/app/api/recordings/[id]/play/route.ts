
import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth-utils';
import { getRecordingById } from '@/lib/db/recordings';
import { getSignedR2Url } from '@/lib/r2';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const firebaseUid = await getUserFromRequest(request);

    if (!firebaseUid) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { id } = await params;
        const recording = await getRecordingById(id, firebaseUid);

        if (!recording) {
            return NextResponse.json({ error: 'Recording not found' }, { status: 404 });
        }

        // Generate signed URL valid for 1 hour
        const playbackUrl = await getSignedR2Url(recording.r2Key, 3600);

        return NextResponse.json({
            playbackUrl,
            expiresAt: Date.now() + 3600 * 1000
        });
    } catch (error) {
        console.error('Error getting playback URL:', error);
        return NextResponse.json(
            { error: 'Failed to generate playback URL' },
            { status: 500 }
        );
    }
}
