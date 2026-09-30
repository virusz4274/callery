/**
 * Admin-side failure events for transcription. End users only ever see
 * `transcriptionStatus: 'failed'`; the reason (provider, error, quota
 * verdict) goes to the admin audit log via logSystemEvent, where it shows
 * up filterable by action. Nothing here is user-visible, so messages stay
 * technical — but truncated to keep log rows small.
 */

export interface TranscriptionFailureContext {
    provider: string;
    recordingId: string;
    authSubject: string;
    durationSeconds?: number;
}

const MAX_ERROR_CHARS = 500;

function errorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.length > MAX_ERROR_CHARS ? `${message.slice(0, MAX_ERROR_CHARS)}…` : message;
}

function baseDetails(context: TranscriptionFailureContext): Record<string, unknown> {
    return {
        provider: context.provider,
        recordingId: context.recordingId,
        authSubject: context.authSubject,
        ...(context.durationSeconds !== undefined ? { durationSeconds: context.durationSeconds } : {}),
        timestamp: new Date().toISOString(),
    };
}

/** Details for TRANSCRIPTION_FAILED (the job threw). Pure — unit testable. */
export function toFailureDetails(
    error: unknown,
    context: TranscriptionFailureContext,
): Record<string, unknown> {
    return { ...baseDetails(context), error: errorMessage(error) };
}

/** Details for TRANSCRIPTION_BLOCKED (quota/policy denied before starting). Pure. */
export function toBlockedDetails(
    reason: string,
    context: TranscriptionFailureContext,
): Record<string, unknown> {
    return { ...baseDetails(context), reason };
}
