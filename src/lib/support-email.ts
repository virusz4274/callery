import type { SupportMessageDocument } from '@/lib/db/support-messages';
import { sendEmail } from '@/lib/email';

function escapeHtml(input: string): string {
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function buildSupportMessageEmailHtml(message: SupportMessageDocument): string {
    const escapedName = escapeHtml(message.name);
    const escapedEmail = escapeHtml(message.email);
    const escapedSubject = escapeHtml(message.subject);
    const escapedMessage = escapeHtml(message.message).replace(/\n/g, '<br/>');
    const escapedUid = escapeHtml(message.firebaseUid || 'Anonymous');

    return `
        <h2>New Support Request</h2>
        <p><strong>Name:</strong> ${escapedName}</p>
        <p><strong>Email:</strong> ${escapedEmail}</p>
        <p><strong>Firebase UID:</strong> ${escapedUid}</p>
        <p><strong>Created At:</strong> ${message.createdAt.toISOString()}</p>
        <hr />
        <p><strong>Subject:</strong> ${escapedSubject}</p>
        <p><strong>Message:</strong></p>
        <p>${escapedMessage}</p>
    `;
}

export async function sendSupportMessageNotification(
    message: SupportMessageDocument,
    recipient: string
) {
    const result = await sendEmail({
        to: recipient,
        subject: `[Call Memo Support] ${message.subject}`,
        html: buildSupportMessageEmailHtml(message),
    });

    if (!result.success) {
        const errorValue = result.error;
        const errorMessage =
            typeof errorValue === 'string'
                ? errorValue
                : errorValue instanceof Error
                    ? errorValue.message
                    : 'Unknown email delivery error';
        throw new Error(errorMessage);
    }
}
