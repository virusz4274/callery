import type { ExportJob } from '@/lib/db/types';
import type { ExportPartMeta } from './types';

export function getPartKey(authSubject: string, jobId: string, partNumber: number): string {
    return `exports/${authSubject}/${jobId}/part_${partNumber}.zip`;
}

export function inferNextPartNumber(parts: ExportPartMeta[]): number {
    let maxPart = 0;

    for (const part of parts) {
        const match = part.key.match(/part_(\d+)\.zip$/);
        if (!match) {
            continue;
        }

        const parsed = Number.parseInt(match[1], 10);
        if (!Number.isNaN(parsed) && parsed > maxPart) {
            maxPart = parsed;
        }
    }

    return maxPart + 1 || 1;
}

export function toStorageParts(parts: ExportPartMeta[]): NonNullable<ExportJob['parts']> {
    return parts.map((part) => ({
        key: part.key,
        size: part.size,
        url: '',
        expiresAt: new Date(0),
    }));
}

export function upsertPart(parts: ExportPartMeta[], next: ExportPartMeta): ExportPartMeta[] {
    const index = parts.findIndex((part) => part.key === next.key);
    if (index === -1) {
        return [...parts, next];
    }

    const copy = [...parts];
    copy[index] = next;
    return copy;
}
