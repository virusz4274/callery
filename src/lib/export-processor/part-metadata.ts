import type { ExportJob } from '@/lib/db/types';
import type { ExportPartMeta } from './types';

export function getPartKey(authSubject: string, jobId: string, partNumber: number): string {
    return `exports/${authSubject}/${jobId}/part_${partNumber}.zip`;
}

export function toStorageParts(parts: ExportPartMeta[]): ExportJob['parts'] {
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
