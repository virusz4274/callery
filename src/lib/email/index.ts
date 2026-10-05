import { emailProvider } from '../config';
import { ResendEmailService } from './resend-service';
import { SmtpEmailService } from './smtp-service';
import type { IEmailService, SendEmailInput } from './types';

export type { IEmailService, SendEmailInput };

let cached: IEmailService | null | undefined;

/** Email backend selected by EMAIL_PROVIDER. Null when EMAIL_PROVIDER=none. */
export function getEmailService(): IEmailService | null {
    if (cached === undefined) {
        const provider = emailProvider();
        cached =
            provider === 'resend'
                ? new ResendEmailService()
                : provider === 'smtp'
                  ? new SmtpEmailService()
                  : null;
    }
    return cached;
}

/**
 * Send an auth email (verification / password reset). With EMAIL_PROVIDER=none
 * the send is skipped — local dev auto-verifies instead (requireEmailVerification
 * is off in that mode), so callers never need to branch.
 */
export async function sendAuthEmail(input: SendEmailInput): Promise<void> {
    const service = getEmailService();
    if (!service) {
        if (process.env.NODE_ENV !== 'production') {
            console.log(`[email:none] to=${input.to} subject=${JSON.stringify(input.subject)}`);
        }
        return;
    }
    await service.send(input);
}

/**
 * Send a notification email (ingest results, activity digests). Null-safe:
 * with EMAIL_PROVIDER=none the send is skipped and the caller never fails.
 * Returns false when skipped so callers can log accurately.
 */
export async function sendNotificationEmail(input: SendEmailInput): Promise<boolean> {
    const service = getEmailService();
    if (!service) {
        if (process.env.NODE_ENV !== 'production') {
            console.log(`[email:none] to=${input.to} subject=${JSON.stringify(input.subject)}`);
        }
        return false;
    }
    await service.send(input);
    return true;
}

/** Compatibility contract for feature emails, using the selected provider. */
export async function sendEmail(input: SendEmailInput) {
    try {
        const sent = await sendNotificationEmail(input);
        return { messageId: undefined as string | undefined, success: sent, error: sent ? undefined : new Error('Email delivery is disabled.') };
    } catch (error) {
        return { messageId: undefined as string | undefined, success: false, error };
    }
}
