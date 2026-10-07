import { ObjectId } from 'mongodb';
import type { RecordingCountOptions, RecordingQueryOptions } from './types';

type RecordingFilterOptions = RecordingQueryOptions | RecordingCountOptions;

function escapeRegex(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeEndDate(value: string): Date | null {
    const end = new Date(value);
    if (Number.isNaN(end.getTime())) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) end.setUTCHours(23, 59, 59, 999);
    return end;
}

function buildDateQuery(startDate?: string, endDate?: string): Record<string, unknown> | undefined {
    if (!startDate && !endDate) {
        return undefined;
    }

    const dateQuery: Record<string, unknown> = {};

    if (startDate) {
        const start = new Date(startDate);
        if (!Number.isNaN(start.getTime())) {
            dateQuery.$gte = start;
        }
    }

    if (endDate) {
        const end = normalizeEndDate(endDate);
        if (end) {
            dateQuery.$lte = end;
        }
    }

    return Object.keys(dateQuery).length > 0 ? dateQuery : undefined;
}

export function buildRecordingsQuery(
    authSubject: string,
    options?: RecordingFilterOptions
): Record<string, unknown> {
    const query: Record<string, unknown> = { authSubject };

    if (!options?.includeArchived) {
        query.isArchived = { $ne: true };
    }
    if (options?.needsTranscription) {
        query.transcriptionStatus = { $ne: 'completed' };
    }

    if (options?.contactName) {
        query.contactName = options.contactName === 'Unknown' ? null : options.contactName;
    }

    if (options?.search?.trim()) {
        const safePattern = escapeRegex(options.search.trim());
        query.$or = [
            { contactName: { $regex: safePattern, $options: 'i' } },
            { phoneNumber: { $regex: safePattern, $options: 'i' } },
            { fileName: { $regex: safePattern, $options: 'i' } },
            { standardizedDisplayName: { $regex: safePattern, $options: 'i' } },
            { tags: { $regex: safePattern, $options: 'i' } },
            { 'fullTranscript.text': { $regex: safePattern, $options: 'i' } },
            { summary: { $regex: safePattern, $options: 'i' } },
        ];
    }

    if (options?.contactId) {
        query.contactId = new ObjectId(options.contactId);
    }

    const dateQuery = buildDateQuery(options?.startDate, options?.endDate);
    if (dateQuery) {
        query.recordedAt = dateQuery;
    }

    return query;
}

export function buildRecordingsSort(options?: RecordingQueryOptions): Record<string, 1 | -1> {
    if (options?.sortBy === 'duration') {
        return { duration: options.sortOrder === 'asc' ? 1 : -1 };
    }

    return { recordedAt: options?.sortOrder === 'asc' ? 1 : -1 };
}
