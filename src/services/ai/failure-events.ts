import { logSystemEvent } from '@/lib/db/system-log';
import type { AiStepContext } from './types';

/**
 * Admin-side failure events for AI text steps (summary, transliteration,
 * embedding). Users only ever see the graceful fallback (empty summary,
 * untransliterated segments, missing vector); the reason goes to the admin
 * audit log as AI_STEP_FAILED with the step named in details.
 */

export type AiStep = 'summary' | 'transliteration' | 'embedding';

export interface AiStepFailure {
    step: AiStep;
    provider: string;
    model: string;
    context?: AiStepContext;
}

const MAX_ERROR_CHARS = 500;

/** Details for AI_STEP_FAILED. Pure — unit testable. */
export function toAiStepFailureDetails(
    error: unknown,
    failure: AiStepFailure,
): Record<string, unknown> {
    const message = error instanceof Error ? error.message : String(error);
    return {
        step: failure.step,
        provider: failure.provider,
        model: failure.model,
        ...(failure.context?.recordingId ? { recordingId: failure.context.recordingId } : {}),
        ...(failure.context?.authSubject ? { authSubject: failure.context.authSubject } : {}),
        error: message.length > MAX_ERROR_CHARS ? `${message.slice(0, MAX_ERROR_CHARS)}…` : message,
        timestamp: new Date().toISOString(),
    };
}

/** Log an AI step failure to the admin audit log. Never throws. */
export async function logAiStepFailure(error: unknown, failure: AiStepFailure): Promise<void> {
    await logSystemEvent(
        'AI_STEP_FAILED',
        toAiStepFailureDetails(error, failure),
        failure.context?.recordingId,
    );
}
