import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ObjectId } from 'mongodb';
import { Collections, getMongoDb } from '@/lib/mongodb';
import { getFirebaseUidFromSession, getUserFromRequest } from '@/lib/auth-utils';
import { sendEmail } from '@/lib/email';

const supportMessageSchema = z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(200),
    subject: z.string().trim().min(3).max(200),
    message: z.string().trim().min(10).max(5000),
});

interface SupportMessageDocument {
    _id: ObjectId;
    firebaseUid: string | null;
    name: string;
    email: string;
    subject: string;
    message: string;
    userAgent?: string;
    ipAddress?: string;
    createdAt: Date;
}

function escapeHtml(input: string): string {
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const parsed = supportMessageSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                {
                    error: 'Invalid request payload',
                    fieldErrors: parsed.error.flatten().fieldErrors,
                },
                { status: 400 }
            );
        }

        let firebaseUid = await getUserFromRequest(request);
        if (!firebaseUid) {
            firebaseUid = await getFirebaseUidFromSession();
        }

        const db = await getMongoDb();
        const now = new Date();

        const doc: SupportMessageDocument = {
            _id: new ObjectId(),
            firebaseUid: firebaseUid || null,
            ...parsed.data,
            userAgent: request.headers.get('user-agent') || undefined,
            ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined,
            createdAt: now,
        };

        await db.collection<SupportMessageDocument>(Collections.SUPPORT_MESSAGES).insertOne(doc);

        const supportEmail = process.env.SUPPORT_EMAIL;
        if (supportEmail) {
            const escapedName = escapeHtml(parsed.data.name);
            const escapedEmail = escapeHtml(parsed.data.email);
            const escapedSubject = escapeHtml(parsed.data.subject);
            const escapedMessage = escapeHtml(parsed.data.message).replace(/\n/g, '<br/>');
            const escapedUid = escapeHtml(firebaseUid || 'Anonymous');

            await sendEmail({
                to: supportEmail,
                subject: `[Call Memo Support] ${escapedSubject}`,
                html: `
                    <h2>New Support Request</h2>
                    <p><strong>Name:</strong> ${escapedName}</p>
                    <p><strong>Email:</strong> ${escapedEmail}</p>
                    <p><strong>Firebase UID:</strong> ${escapedUid}</p>
                    <p><strong>Created At:</strong> ${now.toISOString()}</p>
                    <hr />
                    <p><strong>Message:</strong></p>
                    <p>${escapedMessage}</p>
                `,
            });
        }

        return NextResponse.json({
            success: true,
            id: doc._id.toString(),
        });
    } catch (error) {
        console.error('[Support API] Failed to create support request:', error);
        return NextResponse.json({ error: 'Failed to submit support request' }, { status: 500 });
    }
}
