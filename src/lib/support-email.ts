import type { SupportMessageDocument } from '@/lib/db/support-messages';
import { sendNotificationEmail } from '@/lib/email';

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
    const escapedUid = escapeHtml(message.authSubject || 'Anonymous');

    return `
        <h2>New Support Request</h2>
        <p><strong>Name:</strong> ${escapedName}</p>
        <p><strong>Email:</strong> ${escapedEmail}</p>
        <p><strong>Account ID:</strong> ${escapedUid}</p>
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
    const sent = await sendNotificationEmail({
        to: recipient,
        subject: `[Callery Support] ${message.subject}`,
        html: buildSupportMessageEmailHtml(message),
    });

    if (!sent) throw new Error('Email delivery is disabled.');
}
