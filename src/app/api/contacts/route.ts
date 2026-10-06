import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth-utils';
import { getContactsByUser, countContactsByUser } from '@/lib/db/contacts';
import { toContactResponse } from '@/lib/db/converters';
import { ContactsListQuerySchema } from '@/lib/schemas';
import { logger } from '@/lib/logger';


/**
 * GET /api/contacts
 *
 * Fetch all contacts for the authenticated user.
 */
export async function GET(request: NextRequest) {
    const authSubject = await getUserFromRequest(request);

    if (!authSubject) {
        return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
        );
    }

    try {
        const { searchParams } = new URL(request.url);
        const queryParsed = ContactsListQuerySchema.safeParse({
            limit: searchParams.get('limit') ?? undefined,
            skip: searchParams.get('skip') ?? undefined,
            search: searchParams.get('search') ?? undefined,
        });
        if (!queryParsed.success) {
            return NextResponse.json({ error: 'Invalid query' }, { status: 400 });
        }
        const { limit, skip } = queryParsed.data;

        const contacts = await getContactsByUser(authSubject, { limit, skip });

        const totalCount = await countContactsByUser(authSubject);

        return NextResponse.json({
            contacts: contacts.map(toContactResponse),
            totalCount,
            limit,
            skip
        });
    } catch (error) {
        logger.error('Error fetching contacts:', error);
        return NextResponse.json(
            { error: 'Failed to fetch contacts' },
            { status: 500 }
        );
    }
}
