import type {
    ExternalServiceIncidentErrorKind,
    ExternalServiceIncidentSeverity,
} from '@/lib/db/types';

export type IncidentClassification = {
    errorKind: ExternalServiceIncidentErrorKind;
    severity: ExternalServiceIncidentSeverity;
    httpStatus?: number;
    message: string;
    retryable: boolean;
};

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function parseJsonFromMessage(message: string): Record<string, unknown> | null {
    const start = message.indexOf('{');
    if (start === -1) {
        return null;
    }

    const candidate = message.slice(start);
    try {
        const parsed = JSON.parse(candidate);
        return isObject(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function coerceStatus(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string') {
        const match = value.match(/\b([45]\d{2})\b/);
        if (match) {
            return Number(match[1]);
        }
    }

    return undefined;
}

function extractStatus(error: unknown): number | undefined {
    if (isObject(error)) {
        const directStatus = coerceStatus(error.status ?? error.statusCode ?? error.code);
        if (directStatus) {
            return directStatus;
        }

        const nestedError = error.error;
        if (isObject(nestedError)) {
            const nestedStatus = coerceStatus(nestedError.status ?? nestedError.code);
            if (nestedStatus) {
                return nestedStatus;
            }
        }
    }

    if (error instanceof Error) {
        const parsed = parseJsonFromMessage(error.message);
        if (parsed?.error && isObject(parsed.error)) {
            const nestedStatus = coerceStatus(parsed.error.status ?? parsed.error.code);
            if (nestedStatus) {
                return nestedStatus;
            }
        }

        return coerceStatus(error.message);
    }

    return coerceStatus(error);
}

function extractMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    if (typeof error === 'string') {
        return error;
    }

    if (isObject(error)) {
        if (typeof error.message === 'string' && error.message.trim()) {
            return error.message;
        }

        try {
            return JSON.stringify(error);
        } catch {
            return 'Unknown external service error';
        }
    }

    return 'Unknown external service error';
}

function classifyWithoutStatus(message: string): IncidentClassification {
    const normalized = message.toLowerCase();

    if (normalized.includes('resource_exhausted') || normalized.includes('quota')) {
        return {
            errorKind: 'quota',
            severity: 'degraded',
            message,
            retryable: true,
        };
    }

    if (normalized.includes('rate limit') || normalized.includes('too many request')) {
        return {
            errorKind: 'rate_limit',
            severity: 'degraded',
            message,
            retryable: true,
        };
    }

    if (
        normalized.includes('timed out')
        || normalized.includes('timeout')
        || normalized.includes('etimedout')
        || normalized.includes('aborted')
    ) {
        return {
            errorKind: 'timeout',
            severity: 'degraded',
            message,
            retryable: true,
        };
    }

    if (
        normalized.includes('fetch failed')
        || normalized.includes('network')
        || normalized.includes('econnreset')
        || normalized.includes('enotfound')
        || normalized.includes('eai_again')
        || normalized.includes('socket hang up')
    ) {
        return {
            errorKind: 'network',
            severity: 'degraded',
            message,
            retryable: true,
        };
    }

    if (normalized.includes('not defined') || normalized.includes('missing') || normalized.includes('unauthorized')) {
        return {
            errorKind: 'auth',
            severity: 'down',
            message,
            retryable: false,
        };
    }

    return {
        errorKind: 'unknown',
        severity: 'degraded',
        message,
        retryable: false,
    };
}

export function classifyExternalServiceError(error: unknown): IncidentClassification {
    const message = extractMessage(error);
    const httpStatus = extractStatus(error);

    if (httpStatus === 401 || httpStatus === 403) {
        return {
            errorKind: 'auth',
            severity: 'down',
            httpStatus,
            message,
            retryable: false,
        };
    }

    if (httpStatus === 402) {
        return {
            errorKind: 'quota',
            severity: 'degraded',
            httpStatus,
            message,
            retryable: true,
        };
    }

    if (httpStatus === 429) {
        const normalized = message.toLowerCase();
        return {
            errorKind: normalized.includes('quota') || normalized.includes('resource_exhausted') ? 'quota' : 'rate_limit',
            severity: 'degraded',
            httpStatus,
            message,
            retryable: true,
        };
    }

    if (httpStatus === 408) {
        return {
            errorKind: 'timeout',
            severity: 'degraded',
            httpStatus,
            message,
            retryable: true,
        };
    }

    if (httpStatus && httpStatus >= 500) {
        return {
            errorKind: 'upstream_5xx',
            severity: 'degraded',
            httpStatus,
            message,
            retryable: true,
        };
    }

    if (httpStatus && httpStatus >= 400) {
        return {
            errorKind: 'validation',
            severity: 'down',
            httpStatus,
            message,
            retryable: false,
        };
    }

    return {
        ...classifyWithoutStatus(message),
        httpStatus,
    };
}
