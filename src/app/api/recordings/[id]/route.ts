import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getUserFromRequest } from '@/lib/auth-utils';
import { getRecordingById, deleteRecording, updateRecording } from '@/lib/db/recordings';
import { toRecordingResponse } from '@/lib/db/converters';
import { deleteFromR2, getSignedR2Url } from '@/lib/r2';
import { decrementStorageUsed } from '@/lib/db/users';


interface RouteParams {
    params: Promise<{ id: string }>;
}

function invalidIdResponse() {
    return NextResponse.json({ error: 'Invalid recording id' }, { status: 400 });
}

/** Returns an error message when the update payload is malformed, else null. */
function validateRecordingUpdate(updateData: Record<string, unknown>): string | null {
    for (const key of ['isStarred', 'isArchived'] as const) {
        if (key in updateData && typeof updateData[key] !== 'boolean') {
            return `Invalid ${key}`;
        }
    }
    if ('tags' in updateData) {
        const tags = updateData.tags;
        if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== 'string')) {
            return 'Invalid tags';
        }
    }
    if ('contactName' in updateData) {
        const value = updateData.contactName;
        if (value !== null && typeof value !== 'string') return 'Invalid contactName';
    }
    if ('contactId' in updateData) {
        const value = updateData.contactId;
        if (value !== null && (typeof value !== 'string' || !ObjectId.isValid(value))) {
            return 'Invalid contactId';
        }
    }
    return null;
}

/**
 * GET /api/recordings/[id]
 * 
 * Get a single recording with a fresh signed URL.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
    const authSubject = await getUserFromRequest(request);

    if (!authSubject) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { id } = await params;
        if (!ObjectId.isValid(id)) return invalidIdResponse();
        const recording = await getRecordingById(id, authSubject);

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
    const authSubject = await getUserFromRequest(request);

    if (!authSubject) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { id } = await params;
        if (!ObjectId.isValid(id)) return invalidIdResponse();
        const body = await request.json();

        // Only allow updating specific fields
        const allowedFields = ['isStarred', 'isArchived', 'tags', 'contactName', 'contactId'];
        const updateData: Record<string, unknown> = {};

        for (const field of allowedFields) {
            if (field in body) {
                updateData[field] = body[field];
            }
        }

        const settingsError = validateRecordingUpdate(updateData);
        if (settingsError) {
            return NextResponse.json({ error: settingsError }, { status: 400 });
        }

        // Store contactId as an ObjectId, never a raw string.
        if (typeof updateData.contactId === 'string') {
            updateData.contactId = new ObjectId(updateData.contactId);
        }

        const recording = await updateRecording(id, authSubject, updateData);

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
    const authSubject = await getUserFromRequest(request);

    if (!authSubject) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { id } = await params;
        if (!ObjectId.isValid(id)) return invalidIdResponse();

        // Delete from MongoDB first (to get the R2 key)
        const deletedRecording = await deleteRecording(id, authSubject);

        if (!deletedRecording) {
            return NextResponse.json({ error: 'Recording not found' }, { status: 404 });
        }

        // Delete from R2 (same semantics as the batch delete action: usage
        // is only reclaimed when the file is actually removed).
        try {
            await deleteFromR2(deletedRecording.r2Key);
            await decrementStorageUsed(authSubject, deletedRecording.fileSize);
            const { reportUsage } = await import('@/lib/stripe/usage');
            await reportUsage(authSubject, 'storage', -(deletedRecording.fileSize / (1024 * 1024 * 1024)));
        } catch (r2Error) {
            console.error('Error deleting from R2 (continuing anyway):', r2Error);
            // Don't fail the request if R2 deletion fails
        }

        return NextResponse.json({ success: true, id });
    } catch (error) {
        console.error('Error deleting recording:', error);
        return NextResponse.json({ error: 'Failed to delete recording' }, { status: 500 });
    }
}
