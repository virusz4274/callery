'use server';

import { ObjectId } from 'mongodb';
import { getFirebaseUidFromSession } from '@/lib/auth-utils';
import { getRecordingsForApi, countRecordingsByUser, deleteRecording, updateRecording, getRecordingById } from '@/lib/db/recordings';
import { deleteFromR2, getSignedR2Url } from '@/lib/r2';
import { decrementStorageUsed } from '@/lib/db/users';
import { toRecordingResponse } from '@/lib/db/converters';
import { revalidatePath } from 'next/cache';
import { GetRecordingsOptionsSchema, RecordingIdSchema, UpdateRecordingSchema, GetRecordingsOptionsInput } from '@/lib/schemas';

// Re-export specific input type if needed by client, or just use the schema inferred type
export type GetRecordingsOptions = GetRecordingsOptionsInput;

function revalidateRecordingPages() {
    revalidatePath('/recordings');
    revalidatePath('/files');
}

export async function getRecordingsAction(options: GetRecordingsOptions = {}) {
    // 1. Validate Input
    const parseResult = GetRecordingsOptionsSchema.safeParse(options);
    if (!parseResult.success) {
        console.error('Validation failed for getRecordingsAction:', parseResult.error);
        return { error: 'Invalid parameters' };
    }
    const validatedOptions = parseResult.data;

    const firebaseUid = await getFirebaseUidFromSession();
    if (!firebaseUid) {
        return { error: 'Unauthorized' };
    }

    try {
        const limit = validatedOptions.limit || 100;
        const page = validatedOptions.page || 1;
        const skip = validatedOptions.skip !== undefined ? validatedOptions.skip : (page - 1) * limit;

        const [recordings, totalCount] = await Promise.all([
            getRecordingsForApi(firebaseUid, {
                ...validatedOptions,
                limit,
                skip,
            }),
            countRecordingsByUser(firebaseUid, validatedOptions),
        ]);

        return {
            recordings,
            totalCount,
            page,
            limit
        };
    } catch (error) {
        console.error('Error fetching recordings:', error);
        return { error: 'Failed to fetch recordings' };
    }
}

export async function deleteRecordingAction(id: string) {
    const firebaseUid = await getFirebaseUidFromSession();
    if (!firebaseUid) {
        return { success: false, error: 'Unauthorized' };
    }

    const parseResult = RecordingIdSchema.safeParse(id);
    if (!parseResult.success) {
        return { success: false, error: 'Invalid recording ID' };
    }

    try {
        const recording = await getRecordingById(parseResult.data, firebaseUid);
        if (!recording) {
            return { success: false, error: 'Recording not found' };
        }

        try {
            await deleteFromR2(recording.r2Key);
        } catch (r2Error) {
            console.error('Error deleting from R2:', r2Error);
            return { success: false, error: 'Failed to delete audio from storage. Recording was not removed.' };
        }

        const deletedRecording = await deleteRecording(parseResult.data, firebaseUid);
        if (!deletedRecording) {
            return { success: false, error: 'Recording could not be removed after deleting audio from storage' };
        }

        await decrementStorageUsed(firebaseUid, deletedRecording.fileSize);

        revalidateRecordingPages();
        return { success: true };
    } catch (error) {
        console.error('Error deleting recording:', error);
        return { success: false, error: 'Failed to delete recording' };
    }
}

export async function updateRecordingAction(id: string, data: { isStarred?: boolean; isArchived?: boolean; tags?: string[] }) {
    const firebaseUid = await getFirebaseUidFromSession();
    if (!firebaseUid) {
        return { success: false, error: 'Unauthorized' };
    }

    const idParse = RecordingIdSchema.safeParse(id);
    if (!idParse.success) {
        return { success: false, error: 'Invalid recording ID' };
    }

    const dataParse = UpdateRecordingSchema.safeParse(data);
    if (!dataParse.success) {
        return { success: false, error: 'Invalid update data' };
    }

    try {
        const updateData: any = { ...dataParse.data };
        if (updateData.contactId) {
            updateData.contactId = new ObjectId(updateData.contactId);
        }

        const recording = await updateRecording(idParse.data, firebaseUid, updateData);

        if (!recording) {
            return { success: false, error: 'Recording not found' };
        }

        revalidateRecordingPages();
        return { success: true, recording: toRecordingResponse(recording) };
    } catch (error) {
        console.error('Error updating recording:', error);
        return { success: false, error: 'Failed to update recording' };
    }
}

export async function getPlaybackUrlAction(id: string) {
    const firebaseUid = await getFirebaseUidFromSession();
    if (!firebaseUid) {
        return { error: 'Unauthorized' };
    }

    const parseResult = RecordingIdSchema.safeParse(id);
    if (!parseResult.success) {
        return { error: 'Invalid recording ID' };
    }

    try {
        const recording = await getRecordingById(parseResult.data, firebaseUid);
        if (!recording) {
            return { error: 'Recording not found' };
        }

        const playbackUrl = await getSignedR2Url(recording.r2Key, 3600);
        return { playbackUrl };
    } catch (error) {
        console.error('Error generating playback URL:', error);
        return { error: 'Failed to generate playback URL' };
    }
}

export async function getRecordingDetailsAction(id: string) {
    const firebaseUid = await getFirebaseUidFromSession();
    if (!firebaseUid) {
        return { error: 'Unauthorized' };
    }

    const parseResult = RecordingIdSchema.safeParse(id);
    if (!parseResult.success) {
        return { error: 'Invalid recording ID' };
    }

    try {
        const recording = await getRecordingById(parseResult.data, firebaseUid);
        if (!recording) {
            return { error: 'Recording not found' };
        }

        const playbackUrl = await getSignedR2Url(recording.r2Key, 3600);
        return { recording: toRecordingResponse(recording, playbackUrl) };
    } catch (error) {
        console.error('Error fetching recording details:', error);
        return { error: 'Failed to fetch recording details' };
    }
}
