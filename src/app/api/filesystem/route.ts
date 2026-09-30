import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth-utils';
import { getRecordingsByUser } from '@/lib/db/recordings';
import type { FileSystemNode } from '@/lib/types';
import type { Recording } from '@/lib/db/types';

/**
 * Converts a file size in bytes to a human-readable string.
 */
function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Builds a folder hierarchy from recordings.
 * Structure: Contact Name → Year → Month → Files
 */
function buildFileSystemTree(recordings: Recording[]): FileSystemNode {
    const contactMap = new Map<string, Map<string, Map<string, Recording[]>>>();
    const contactLastModified = new Map<string, Date>();

    for (const recording of recordings) {
        const contactName = recording.contactName || recording.phoneNumber || 'Unknown';
        const recordedAt = new Date(recording.recordedAt);
        const year = recordedAt.getFullYear().toString();
        const month = String(recordedAt.getMonth() + 1).padStart(2, '0');

        // Track contact map
        if (!contactMap.has(contactName)) {
            contactMap.set(contactName, new Map());
        }
        const yearMap = contactMap.get(contactName)!;

        if (!yearMap.has(year)) {
            yearMap.set(year, new Map());
        }
        const monthMap = yearMap.get(year)!;

        if (!monthMap.has(month)) {
            monthMap.set(month, []);
        }
        monthMap.get(month)!.push(recording);

        // Track last modified for contact
        const currentLastModified = contactLastModified.get(contactName);
        if (!currentLastModified || recordedAt > currentLastModified) {
            contactLastModified.set(contactName, recordedAt);
        }
    }

    // Build the tree
    const children: FileSystemNode[] = [];

    // Add contact folders
    for (const [contactName, yearMap] of contactMap.entries()) {
        const contactId = `folder-${contactName.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const yearChildren: FileSystemNode[] = [];

        for (const [year, monthMap] of yearMap.entries()) {
            const yearId = `${contactId}-${year}`;
            const monthChildren: FileSystemNode[] = [];
            let yearLastModified = new Date(0);

            for (const [month, monthRecordings] of monthMap.entries()) {
                const monthId = `${yearId}-${month}`;
                let monthLastModified = new Date(0);

                const fileChildren: FileSystemNode[] = monthRecordings.map((recording) => {
                    const recordedAt = new Date(recording.recordedAt);
                    if (recordedAt > monthLastModified) {
                        monthLastModified = recordedAt;
                    }

                    // Format: ContactName_YYMMDD_HHMMSS.ext
                    const dateStr = recordedAt.toISOString().slice(2, 10).replace(/-/g, '');
                    const timeStr = recordedAt.toTimeString().slice(0, 8).replace(/:/g, '');
                    const ext = recording.fileName.split('.').pop() || 'm4a';
                    const displayName = `${contactName.replace(/\s+/g, '_')}_${dateStr}_${timeStr}.${ext}`;

                    return {
                        id: `file-${recording._id.toString()}`,
                        name: displayName,
                        type: 'file' as const,
                        size: formatFileSize(recording.fileSize),
                        lastModified: recordedAt.toISOString(),
                    };
                });

                if (monthLastModified > yearLastModified) {
                    yearLastModified = monthLastModified;
                }

                monthChildren.push({
                    id: monthId,
                    name: month,
                    type: 'folder',
                    lastModified: monthLastModified.toISOString(),
                    children: fileChildren,
                });
            }

            // Sort months in descending order
            monthChildren.sort((a, b) => b.name.localeCompare(a.name));

            yearChildren.push({
                id: yearId,
                name: year,
                type: 'folder',
                lastModified: yearLastModified.toISOString(),
                children: monthChildren,
            });
        }

        // Sort years in descending order
        yearChildren.sort((a, b) => b.name.localeCompare(a.name));

        children.push({
            id: contactId,
            name: contactName,
            type: 'folder',
            lastModified: (contactLastModified.get(contactName) || new Date()).toISOString(),
            children: yearChildren,
        });
    }

    // Sort contacts alphabetically
    children.sort((a, b) => a.name.localeCompare(b.name));

    return {
        id: 'root',
        name: 'Home',
        type: 'folder',
        lastModified: new Date().toISOString(),
        children,
    };
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
        // Fetch all recordings for the user (no pagination for file tree)
        const recordings = await getRecordingsByUser(authSubject, {
            limit: 1000, // Reasonable limit for file browser
            includeArchived: false,
        });

        const fileSystemTree = buildFileSystemTree(recordings);

        return NextResponse.json({ fileSystem: fileSystemTree });
    } catch (error) {
        console.error('Error building file system:', error);
        return NextResponse.json(
            { error: 'Failed to build file system' },
            { status: 500 }
        );
    }
}
