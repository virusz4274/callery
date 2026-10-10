import { z } from 'zod';
import { createHash } from 'node:crypto';
import { INTEGRATION_SCOPES } from './shared';

export const SCOPES = INTEGRATION_SCOPES;
export type Scope = typeof SCOPES[number];
export const MAX_FILE_BYTES = 5 * 1024 ** 3;
export const PART_BYTES = 8 * 1024 ** 2;
export const URL_SECONDS = 900;
export const SESSION_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_SCOPES: Scope[] = ['recordings:upload', 'recordings:read'];

export class ApiError extends Error {
    constructor(public status: number, public code: string, message: string, public retryAfter?: number) { super(message); }
}

export function simpleUploadLimit() {
    const value = Number(process.env.INTEGRATION_SIMPLE_UPLOAD_MAX_BYTES || 25 * 1024 ** 2);
    if (!Number.isSafeInteger(value) || value < 1 || value > 25 * 1024 ** 2) throw new ApiError(503, 'configuration_error', 'Invalid simple upload limit.');
    return value;
}

export function jsonDepth(value: unknown): number {
    let deepest = 0;
    const pending: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
    while (pending.length) {
        const item = pending.pop()!;
        if (item.value === null || typeof item.value !== 'object') continue;
        const depth = item.depth + 1; deepest = Math.max(deepest, depth);
        if (depth > 8) return depth;
        for (const child of Object.values(item.value)) pending.push({ value: child, depth });
    }
    return deepest;
}
const metadata = z.custom<Record<string, unknown>>(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || jsonDepth(value) > 5) return false;
    try { return Object.keys(value).every(key => key.length <= 100) && Buffer.byteLength(JSON.stringify(value)) <= 16 * 1024; } catch { return false; }
}, 'Metadata must be a JSON object within 16 KiB and five nesting levels.');
export const UploadSchema = z.object({
    fileName: z.string().trim().min(1).max(255),
    fileSize: z.number().int().positive().max(MAX_FILE_BYTES),
    mimeType: z.string().trim().min(1).max(127).optional(),
    recordedAt: z.iso.datetime({ offset: true }).optional(),
    contactId: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional(),
    contactName: z.string().trim().max(200).nullable().optional(),
    phoneNumber: z.string().trim().max(40).optional(),
    tags: z.array(z.string().trim().min(1).max(64)).max(50).default([]),
    source: z.string().trim().min(1).max(100).optional(),
    externalId: z.string().trim().min(1).max(255).optional(),
    metadata: metadata.optional(),
}).strict().refine(value => !value.externalId || !!value.source, 'source is required with externalId.');
export type UploadInput = z.infer<typeof UploadSchema>;
export const TokenSchema = z.object({
    name: z.string().trim().min(1).max(100),
    scopes: z.array(z.enum(SCOPES)).min(1).max(SCOPES.length).default(DEFAULT_SCOPES),
    expiresAt: z.iso.datetime({ offset: true }).nullable().optional(),
}).strict();
export const TranscribeSchema = z.object({
    provider: z.enum(['soniox', 'elevenlabs', 'gemini', 'openai_compat']).optional(),
    model: z.string().trim().min(1).max(120).optional(),
}).strict();

export function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().filter(key => (value as Record<string, unknown>)[key] !== undefined).map(key => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
    return JSON.stringify(value);
}
export function fingerprint(value: unknown) { return createHash('sha256').update(canonicalJson(value)).digest('hex'); }
export function idempotencyKey(headers: Headers) {
    const key = headers.get('idempotency-key');
    if (!key || !/^[\x21-\x7e]{1,200}$/.test(key)) throw new ApiError(400, 'invalid_idempotency_key', 'Supply an Idempotency-Key header (1–200 printable characters).');
    return fingerprint(key);
}
