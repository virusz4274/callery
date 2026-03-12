import { formatBytes } from '@/lib/access-control-format';

export const MAX_TRANSCRIPTION_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GiB
export const MAX_TRANSCRIPTION_FILE_SIZE_LABEL = '2 GiB';

export function isTranscriptionFileSizeAllowed(fileSize: number): boolean {
    return fileSize <= MAX_TRANSCRIPTION_FILE_SIZE_BYTES;
}

export function buildTranscriptionFileSizeError(fileSize: number): string {
    return `Transcription supports files up to ${MAX_TRANSCRIPTION_FILE_SIZE_LABEL}. This file is ${formatBytes(fileSize)}.`;
}
