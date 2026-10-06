'use server';

import { logger } from '@/lib/logger';

import { ObjectId } from 'mongodb';
import { getAuthSubjectFromSession } from '@/lib/auth-utils';
import { getRecordingsForApi, countRecordingsByUser, deleteRecording, updateRecording, getRecordingById } from '@/lib/db/recordings';
import { deleteFromR2, getSignedR2Url } from '@/lib/r2';
import { decrementStorageUsed } from '@/lib/db/users';
import { toRecordingResponse } from '@/lib/db/converters';
import { revalidatePath } from 'next/cache';
import { GetRecordingsOptionsSchema, RecordingIdSchema, UpdateRecordingSchema, GetRecordingsOptionsInput } from '@/lib/schemas';
import type { UpdateRecordingInput } from '@/lib/db/types';

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
        logger.error('Validation failed for getRecordingsAction:', parseResult.error);
        return { error: 'Invalid parameters' };
    }
    const validatedOptions = parseResult.data;

    const authSubject = await getAuthSubjectFromSession();
    if (!authSubject) {
        return { error: 'Unauthorized' };
    }

    try {
        const limit = validatedOptions.limit || 100;
        const page = validatedOptions.page || 1;
        const skip = (page - 1) * limit;

        const [recordings, totalCount] = await Promise.all([
            getRecordingsForApi(authSubject, {
                ...validatedOptions,
                limit,
                skip,
            }),
            countRecordingsByUser(authSubject, validatedOptions),
        ]);

        return {
            recordings,
            totalCount,
            page,
            limit
        };
    } catch (error) {
        logger.error('Error fetching recordings:', error);
        return { error: 'Failed to fetch recordings' };
    }
}

export async function deleteRecordingAction(id: string) {
    const authSubject = await getAuthSubjectFromSession();
    if (!authSubject) {
        return { success: false, error: 'Unauthorized' };
    }

    const parseResult = RecordingIdSchema.safeParse(id);
    if (!parseResult.success) {
        return { success: false, error: 'Invalid recording ID' };
    }

    try {
        const recording = await getRecordingById(parseResult.data, authSubject);
        if (!recording) {
            return { success: false, error: 'Recording not found' };
        }

        try {
            await deleteFromR2(recording.r2Key);
        } catch (r2Error) {
            logger.error('Error deleting from R2:', r2Error);
            return { success: false, error: 'Failed to delete audio from storage. Recording was not removed.' };
        }

        const deletedRecording = await deleteRecording(parseResult.data, authSubject);
        if (!deletedRecording) {
            return { success: false, error: 'Recording could not be removed after deleting audio from storage' };
        }

        await decrementStorageUsed(authSubject, deletedRecording.fileSize);

        revalidateRecordingPages();
        return { success: true };
    } catch (error) {
        logger.error('Error deleting recording:', error);
        return { success: false, error: 'Failed to delete recording' };
    }
}

export async function updateRecordingAction(id: string, data: { isStarred?: boolean; isArchived?: boolean; tags?: string[] }) {
    const authSubject = await getAuthSubjectFromSession();
    if (!authSubject) {
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
        const { contactId, ...rest } = dataParse.data;
        const updateData: UpdateRecordingInput = {
            ...rest,
            ...(contactId ? { contactId: new ObjectId(contactId) } : {}),
        };

        const recording = await updateRecording(idParse.data, authSubject, updateData);

        if (!recording) {
            return { success: false, error: 'Recording not found' };
        }

        revalidateRecordingPages();
        return { success: true, recording: toRecordingResponse(recording) };
    } catch (error) {
        logger.error('Error updating recording:', error);
        return { success: false, error: 'Failed to update recording' };
    }
}

export async function getPlaybackUrlAction(id: string) {
    const authSubject = await getAuthSubjectFromSession();
    if (!authSubject) {
        return { error: 'Unauthorized' };
    }

    const parseResult = RecordingIdSchema.safeParse(id);
    if (!parseResult.success) {
        return { error: 'Invalid recording ID' };
    }

    try {
        const recording = await getRecordingById(parseResult.data, authSubject);
        if (!recording) {
            return { error: 'Recording not found' };
        }

        const playbackUrl = await getSignedR2Url(recording.r2Key, 3600);
        return { playbackUrl };
    } catch (error) {
        logger.error('Error generating playback URL:', error);
        return { error: 'Failed to generate playback URL' };
    }
}

export async function getRecordingDetailsAction(id: string) {
    const authSubject = await getAuthSubjectFromSession();
    if (!authSubject) {
        return { error: 'Unauthorized' };
    }

    const parseResult = RecordingIdSchema.safeParse(id);
    if (!parseResult.success) {
        return { error: 'Invalid recording ID' };
    }

    try {
        const recording = await getRecordingById(parseResult.data, authSubject);
        if (!recording) {
            return { error: 'Recording not found' };
        }

        const playbackUrl = await getSignedR2Url(recording.r2Key, 3600);
        return { recording: toRecordingResponse(recording, playbackUrl) };
    } catch (error) {
        logger.error('Error fetching recording details:', error);
        return { error: 'Failed to fetch recording details' };
    }
}
