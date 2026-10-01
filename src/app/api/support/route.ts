import { NextRequest, NextResponse } from 'next/server';
import { getEmailService } from '@/lib/email';
import { logger } from '@/lib/logger';

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Minimal in-memory rate limit (per instance): the contact form is public,
// so cap each IP to a handful of messages per hour to deter spam relays.
// Serverless instances don't share this map; it raises the bar, not a wall.
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const rateLimitHits = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
    const now = Date.now();
    const hits = (rateLimitHits.get(ip) || []).filter((at) => now - at < RATE_LIMIT_WINDOW_MS);
    hits.push(now);
    rateLimitHits.set(ip, hits);
    return hits.length > RATE_LIMIT_MAX;
}

/**
 * POST /api/support
 *
 * Contact-support form delivery. Forwards the message to the support inbox
 * (SUPPORT_EMAIL, falling back to EMAIL_FROM).
 */
export async function POST(req: NextRequest) {
    try {
        const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
        if (isRateLimited(ip)) {
            return NextResponse.json(
                { error: 'Too many messages. Please try again later.' },
                { status: 429 }
            );
        }

        const service = getEmailService();
        if (!service) {
            return NextResponse.json(
                { error: 'Support email is not configured on this instance.' },
                { status: 503 }
            );
        }

        const inbox = process.env.SUPPORT_EMAIL || process.env.EMAIL_FROM;
        if (!inbox) {
            return NextResponse.json(
                { error: 'Support email is not configured on this instance.' },
                { status: 503 }
            );
        }

        const body = await req.json().catch(() => ({}));
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        const email = typeof body.email === 'string' ? body.email.trim() : '';
        const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
        const message = typeof body.message === 'string' ? body.message.trim() : '';

        if (!name || !email || !subject || !message) {
            return NextResponse.json(
                { error: 'Name, email, subject, and message are all required.' },
                { status: 400 }
            );
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return NextResponse.json(
                { error: 'Please provide a valid email address.' },
                { status: 400 }
            );
        }
        if (message.length > 5000) {
            return NextResponse.json(
                { error: 'Message is too long (max 5000 characters).' },
                { status: 400 }
            );
        }

        await service.send({
            to: inbox,
            subject: `[Support] ${subject}`,
            html: [
                `<p><strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p>`,
                `<p><strong>Subject:</strong> ${escapeHtml(subject)}</p>`,
                '<hr />',
                `<p>${escapeHtml(message).replace(/\n/g, '<br />')}</p>`,
            ].join('\n'),
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error('Error delivering support message:', error);
        return NextResponse.json(
            { error: 'Failed to send message. Please try again later.' },
            { status: 500 }
        );
    }
}
