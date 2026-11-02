export type ExportFailureStage = 'validation' | 'source-download' | 'archive-build' | 'archive-upload' | 'checkpoint' | 'finalize' | 'unknown';
export type ExportFailureCode = 'transport' | 'storage' | 'source-changed' | 'source-size' | 'permission' | 'cancelled' | 'budget' | 'attempts-exhausted' | 'archive' | 'internal';

/** Safe to persist or log. Original exceptions remain only in Error.cause. */
export interface ExportFailure {
    stage: ExportFailureStage;
    code: ExportFailureCode;
    retryable: boolean;
    transportCode?: string;
    httpStatus?: number;
}

const transportCodes = new Set([
    'ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'EPIPE', 'ETIMEDOUT', 'ENETDOWN', 'ENETRESET', 'ENETUNREACH',
    'EHOSTDOWN', 'EHOSTUNREACH', 'ENOTFOUND', 'EAI_AGAIN', 'ERR_STREAM_PREMATURE_CLOSE',
    'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET',
    'UND_ERR_ABORTED', 'UND_ERR_INVALID_ARG',
]);
const terminalCodes = new Set<ExportFailureCode>([
    'source-changed', 'source-size', 'permission', 'cancelled', 'budget', 'attempts-exhausted', 'archive', 'internal',
]);

export class ExportProcessingError extends Error {
    constructor(readonly stage: ExportFailureStage, readonly code: ExportFailureCode, cause?: unknown) {
        super(exportFailureMessage({ stage, code }), { cause });
        this.name = 'ExportProcessingError';
    }
}

function errorChain(error: unknown): Record<string, unknown>[] {
    const chain: Record<string, unknown>[] = [];
    const seen = new Set<unknown>();
    while (error && typeof error === 'object' && !seen.has(error) && chain.length < 8) {
        seen.add(error);
        const current = error as Record<string, unknown>;
        chain.push(current);
        error = current.cause;
    }
    return chain;
}

/** Only exact application-owned messages are recognized; arbitrary provider text never escapes. */
function applicationCode(message: unknown): ExportFailureCode | undefined {
    switch (message) {
        case 'Recordings changed while this archive was queued. Request a new export.': return 'source-changed';
        case 'An archive source exceeded its verified size and reserved cost budget.':
        case 'A verified source size is required for this archive.': return 'source-size';
        case 'This archive changed beyond its reserved cost budget. Request a fresh export.':
        case 'The generated archive exceeded its reserved size budget.': return 'budget';
        case 'This export was cancelled because its archive is being removed.':
        case 'This export was cancelled while its archive was uploading.': return 'cancelled';
        case 'Account is unavailable':
        case 'Export requester is unavailable':
        case 'Unauthorized': return 'permission';
        case 'This archive used its normal generation attempt and single recovery attempt. Request a new funded export.': return 'attempts-exhausted';
        default: return undefined;
    }
}

export function toExportFailure(error: unknown, stage: ExportFailureStage = 'unknown'): ExportFailure {
    const chain = errorChain(error);
    const wrapped = chain.find(item => item instanceof ExportProcessingError) as ExportProcessingError | undefined;
    const transportCode = chain.map(item => item.code).find((code): code is string => typeof code === 'string' && transportCodes.has(code));
    const httpStatus = chain.map(item => {
        const metadata = item.$metadata;
        return metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>).httpStatusCode : undefined;
    }).find((status): status is number => Number.isInteger(status) && Number(status) >= 100 && Number(status) <= 599);
    let code = wrapped?.code || chain.map(item => applicationCode(item.message)).find(Boolean);
    if (!code) {
        if (httpStatus === 401 || httpStatus === 403) code = 'permission';
        else if (httpStatus !== undefined) code = 'storage';
        else if (transportCode || chain.some(item => item.name === 'AbortError' || item.name === 'TimeoutError' || item.message === 'fetch failed')) code = 'transport';
        else code = 'internal';
    }
    const retryable = !terminalCodes.has(code) && (httpStatus === undefined
        ? code === 'transport'
        : httpStatus === 408 || httpStatus === 429 || httpStatus >= 500);
    return { stage: wrapped?.stage || stage, code, retryable, ...(transportCode ? { transportCode } : {}), ...(httpStatus !== undefined ? { httpStatus } : {}) };
}

export function wrapExportError(error: unknown, stage: ExportFailureStage, fallbackCode: ExportFailureCode = 'internal'): ExportProcessingError {
    if (error instanceof ExportProcessingError) return error;
    const failure = toExportFailure(error, stage);
    return new ExportProcessingError(stage, failure.code === 'internal' ? fallbackCode : failure.code, error);
}

export function exportFailureMessage(failure: Pick<ExportFailure, 'stage' | 'code'>): string {
    switch (failure.code) {
        case 'source-changed': return 'Recordings changed while this archive was queued. Request a new export.';
        case 'source-size': return 'A recording exceeded its verified size. Request a new export after its size is corrected.';
        case 'permission': return 'This archive is unavailable because access could not be verified.';
        case 'cancelled': return 'This export was cancelled because its archive is being removed.';
        case 'budget': return 'This archive exceeded its reserved size budget. Request a new export.';
        case 'attempts-exhausted': return 'This archive used its generation attempt and single recovery attempt. Request a new export.';
        case 'archive': return 'The archive could not be built.';
        case 'transport':
        case 'storage': return failure.stage === 'source-download' ? 'A recording could not be downloaded from storage.' : 'The archive could not be uploaded to storage.';
        default: return 'The export could not be completed.';
    }
}

export function isRetryableExportFailure(failure?: ExportFailure, legacyError?: string): boolean {
    if (failure) return failure.retryable && !terminalCodes.has(failure.code);
    return legacyError === 'fetch failed' || legacyError === 'TypeError: fetch failed';
}
