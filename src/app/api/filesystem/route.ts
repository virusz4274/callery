import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth-utils';
import { getRecordingsByUser } from '@/lib/db/recordings';
import { buildFileSystemTree } from '@/lib/file-system-tree';
import type { Recording } from '@/lib/db/types';
import { logger } from '@/lib/logger';

async function getAllRecordingsForFileTree(authSubject: string): Promise<Recording[]> {
    const batchSize = 500;
    const allRecordings: Recording[] = [];
    let skip = 0;

    while (true) {
        const batch = await getRecordingsByUser(authSubject, {
            limit: batchSize,
            skip,
            includeArchived: false,
        });

        if (batch.length === 0) {
            break;
        }

        allRecordings.push(...batch);

        if (batch.length < batchSize) {
            break;
        }

        skip += batch.length;
    }

    return allRecordings;
}

/**
 * GET /api/filesystem
 * 
 * Returns a file system tree structure for the authenticated user's recordings.
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
        // Fetch all non-archived recordings in batches to avoid silent truncation.
        const recordings = await getAllRecordingsForFileTree(authSubject);

        const fileSystemTree = buildFileSystemTree(recordings);

        return NextResponse.json({ fileSystem: fileSystemTree });
    } catch (error) {
        logger.error('Error building file system:', error);
        return NextResponse.json(
            { error: 'Failed to build file system' },
            { status: 500 }
        );
    }
}
