import { NextRequest, NextResponse } from 'next/server';
import { ensureUserProfile } from '@/lib/db/users';
import { getRequestIdentity } from '@/lib/auth-utils';
import { EnsureProfileBodySchema } from '@/lib/schemas';
import { logger } from '@/lib/logger';

/**
 * POST /api/user/ensure-profile
 *
 * Ensures a user profile exists in MongoDB.
 * Called after successful Firebase authentication.
 */
export async function POST(request: NextRequest) {
    try {
        const identity = await getRequestIdentity(request);
        if (!identity) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const authSubject = identity.subject;

        const rawBody = await request.json().catch(() => null);
        const parsed = EnsureProfileBodySchema.safeParse(rawBody ?? {});
        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
        }
        const { displayName, firstName, lastName, photoURL } = parsed.data;

        const email = identity.email;

        // Build display name from parts
        let name = displayName || identity.name || '';
        if (firstName || lastName) {
            name = `${firstName || ''} ${lastName || ''} `.trim();
        }
        if (!name) {
            name = email.split('@')[0];
        }

        const { user, wasCreated } = await ensureUserProfile(
            authSubject,
            email,
            name,
            photoURL || identity.image || undefined,
            identity.provider,
            identity.emailVerified
        );

        return NextResponse.json({
            success: true,
            wasCreated,
            userId: user._id.toString(),
        });
    } catch (error) {
        logger.error('Error ensuring user profile:', error);
        const message = error instanceof Error ? error.message : String(error);

        if (message.includes('New signups are currently disabled')) {
            return NextResponse.json(
                {
                    error: message,
                    details: message,
                },
                { status: 403 }
            );
        }

        return NextResponse.json(
            {
                error: 'Failed to ensure user profile',
                details: message
            },
            { status: 500 }
        );
    }
}
