import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getAuthSubjectFromSession, getUserFromRequest } from '@/lib/auth-utils';
import { getRecordingById } from '@/lib/db/recordings';
import { toRecordingResponse } from '@/lib/db/converters';
import { getSignedR2Url } from '@/lib/r2';
import { logger } from '@/lib/logger';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    let authSubject = await getUserFromRequest(request);
    if (!authSubject) {
        authSubject = await getAuthSubjectFromSession();
    }

    if (!authSubject) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    if (!ObjectId.isValid(id)) {
        return NextResponse.json({ error: 'Invalid recording ID' }, { status: 400 });
    }

    try {
        const recording = await getRecordingById(id, authSubject);
        if (!recording) {
            return NextResponse.json({ error: 'Recording not found' }, { status: 404 });
        }

        let playbackUrl: string | undefined;
        try {
            playbackUrl = await getSignedR2Url(recording.r2Key, 3600);
        } catch (error) {
            logger.error('Failed to generate playback URL for recording route:', error);
        }

        return NextResponse.json({
            recording: toRecordingResponse(recording, playbackUrl),
        });
    } catch (error) {
        logger.error('Error fetching recording details:', error);
        return NextResponse.json({ error: 'Failed to fetch recording' }, { status: 500 });
    }
}
