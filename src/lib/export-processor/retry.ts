import { MAX_RETRIES, RETRY_BASE_MS } from './constants';

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
    label: string,
    fn: () => Promise<T>,
    maxAttempts = MAX_RETRIES
): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (attempt === maxAttempts) {
                break;
            }

            const delayMs = RETRY_BASE_MS * Math.pow(2, attempt - 1);
            console.warn(`[Export] ${label} failed (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs}ms`);
            await sleep(delayMs);
        }
    }

    throw lastError instanceof Error ? lastError : new Error(`${label} failed`);
}

export function isNotFoundError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
        return false;
    }

    const err = error as {
        name?: string;
        Code?: string;
        $metadata?: { httpStatusCode?: number };
    };

    return err.$metadata?.httpStatusCode === 404 || err.name === 'NotFound' || err.Code === 'NotFound';
}
