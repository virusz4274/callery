
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getUserFromRequest } from '@/lib/auth-utils';
import { getRecordingById } from '@/lib/db/recordings';
import { getSignedR2Url } from '@/lib/r2';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const authSubject = await getUserFromRequest(request);

    if (!authSubject) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { id } = await params;
        if (!ObjectId.isValid(id)) {
            return NextResponse.json({ error: 'Invalid recording id' }, { status: 400 });
        }
        const recording = await getRecordingById(id, authSubject);

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
