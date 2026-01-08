import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth-utils';
import { getRecordingById, deleteRecording, updateRecording } from '@/lib/db/recordings';
import { toRecordingResponse } from '@/lib/db/converters';
import { deleteFromR2, getSignedR2Url } from '@/lib/r2';
import { decrementStorageUsed } from '@/lib/db/users';


interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * GET /api/recordings/[id]
 * 
 * Get a single recording with a fresh signed URL.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
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

        const playbackUrl = await getSignedR2Url(recording.r2Key, 3600);

        return NextResponse.json(toRecordingResponse(recording, playbackUrl));
    } catch (error) {
        console.error('Error fetching recording:', error);
        return NextResponse.json({ error: 'Failed to fetch recording' }, { status: 500 });
    }
}

/**
 * PATCH /api/recordings/[id]
 * 
 * Update a recording (e.g., star, archive, tags).
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
    const firebaseUid = await getUserFromRequest(request);

    if (!firebaseUid) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { id } = await params;
        const body = await request.json();

        // Only allow updating specific fields
        const allowedFields = ['isStarred', 'isArchived', 'tags', 'contactName', 'contactId'];
        const updateData: Record<string, unknown> = {};

        for (const field of allowedFields) {
            if (field in body) {
                updateData[field] = body[field];
            }
        }

        const recording = await updateRecording(id, firebaseUid, updateData);

        if (!recording) {
            return NextResponse.json({ error: 'Recording not found' }, { status: 404 });
        }

        return NextResponse.json(toRecordingResponse(recording));
    } catch (error) {
        console.error('Error updating recording:', error);
        return NextResponse.json({ error: 'Failed to update recording' }, { status: 500 });
    }
}

/**
 * DELETE /api/recordings/[id]
 * 
 * Delete a recording from MongoDB and R2.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    const firebaseUid = await getUserFromRequest(request);

    if (!firebaseUid) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { id } = await params;

        // Delete from MongoDB first (to get the R2 key)
        const deletedRecording = await deleteRecording(id, firebaseUid);

        if (!deletedRecording) {
            return NextResponse.json({ error: 'Recording not found' }, { status: 404 });
        }

        // Delete from R2
        try {
            await deleteFromR2(deletedRecording.r2Key);
        } catch (r2Error) {
            console.error('Error deleting from R2 (continuing anyway):', r2Error);
            // Don't fail the request if R2 deletion fails
        }

        // Update user's storage usage
        await decrementStorageUsed(firebaseUid, deletedRecording.fileSize);

        return NextResponse.json({ success: true, id });
    } catch (error) {
        console.error('Error deleting recording:', error);
        return NextResponse.json({ error: 'Failed to delete recording' }, { status: 500 });
    }
}
