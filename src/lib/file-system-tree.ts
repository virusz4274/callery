import type { FileSystemNode } from '@/lib/types';
import type { Recording } from '@/lib/db/types';
import { normalizeContactName, normalizeContactPhoneNumber } from '@/lib/db/contacts/normalize';
import { getRecordingCallerLabel } from '@/lib/recording-label';

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
export function buildFileSystemTree(recordings: Recording[]): FileSystemNode {
    const contactMap = new Map<string, Map<string, Map<string, Recording[]>>>();
    const contactLabels = new Map<string, string>();
    const contactLastModified = new Map<string, Date>();

    for (const recording of recordings) {
        const contactName = getRecordingCallerLabel(recording);
        const contactKey = recording.contactId ? `contact-${recording.contactId}`
            : recording.contactMatchSource !== 'name' && recording.phoneNumber && recording.phoneNumber !== 'Unknown'
                ? `phone-${normalizeContactPhoneNumber(recording.phoneNumber)}`
                : `name-${normalizeContactName(contactName)}`;
        contactLabels.set(contactKey, contactName);
        const recordedAt = new Date(recording.recordedAt);
        const year = recordedAt.getFullYear().toString();
        const month = String(recordedAt.getMonth() + 1).padStart(2, '0');

        // Track contact map
        if (!contactMap.has(contactKey)) {
            contactMap.set(contactKey, new Map());
        }
        const yearMap = contactMap.get(contactKey)!;

        if (!yearMap.has(year)) {
            yearMap.set(year, new Map());
        }
        const monthMap = yearMap.get(year)!;

        if (!monthMap.has(month)) {
            monthMap.set(month, []);
        }
        monthMap.get(month)!.push(recording);

        // Track last modified for contact
        const currentLastModified = contactLastModified.get(contactKey);
        if (!currentLastModified || recordedAt > currentLastModified) {
            contactLastModified.set(contactKey, recordedAt);
        }
    }

    // Build the tree
    const children: FileSystemNode[] = [];

    // Add contact folders
    for (const [contactKey, yearMap] of contactMap.entries()) {
        const contactName = contactLabels.get(contactKey)!;
        const contactId = `folder-${encodeURIComponent(contactKey)}`;
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

                    // Call time is displayed separately; original filename is available in details.
                    const displayName = contactName;

                    return {
                        id: `file-${recording._id.toString()}`,
                        name: displayName,
                        type: 'file' as const,
                        recordingId: recording._id.toString(),
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
            lastModified: (contactLastModified.get(contactKey) || new Date()).toISOString(),
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
