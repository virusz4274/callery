import { ObjectId } from 'mongodb';
import type { RecordingCountOptions, RecordingQueryOptions } from './types';

type RecordingFilterOptions = RecordingQueryOptions | RecordingCountOptions;

function escapeRegex(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
        const end = new Date(endDate);
        if (!Number.isNaN(end.getTime())) {
            dateQuery.$lte = end;
        }
    }

    return Object.keys(dateQuery).length > 0 ? dateQuery : undefined;
}

export function buildRecordingsQuery(
    firebaseUid: string,
    options?: RecordingFilterOptions
): Record<string, unknown> {
    const query: Record<string, unknown> = { firebaseUid };

    if (!options?.includeArchived) {
        query.isArchived = { $ne: true };
    }

    if (options?.contactName) {
        query.contactName = options.contactName;
    }

    if (options?.search?.trim()) {
        const safePattern = escapeRegex(options.search.trim());
        query.$or = [
            { contactName: { $regex: safePattern, $options: 'i' } },
            { phoneNumber: { $regex: safePattern, $options: 'i' } },
            { fileName: { $regex: safePattern, $options: 'i' } },
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
