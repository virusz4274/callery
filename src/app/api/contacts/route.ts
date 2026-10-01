import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth-utils';
import { getContactsByUser } from '@/lib/db/contacts';
import type { ContactResponse } from '@/lib/db/types';


/**
 * Convert a Contact document to API response format.
 */
function toContactResponse(contact: Awaited<ReturnType<typeof getContactsByUser>>[number]): ContactResponse {
    return {
        id: contact._id.toString(),
        authSubject: contact.authSubject,
        name: contact.name,

        phoneNumbers: contact.phoneNumbers || [],
        email: contact.email,
        firstName: contact.firstName,
        lastName: contact.lastName,
        jobTitle: contact.jobTitle,
        company: contact.company,
        googleContactId: contact.googleContactId,
        createdAt: contact.createdAt.toISOString(),
        updatedAt: contact.updatedAt.toISOString(),
        totalRecordings: contact.totalRecordings,
        lastRecordingAt: contact.lastRecordingAt?.toISOString() || null,
    };
}

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
        const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10) || 20, 1), 100);
        const skip = Math.max(parseInt(searchParams.get('skip') || '0', 10) || 0, 0);
        const search = searchParams.get('search') || searchParams.get('q') || undefined;

        const contacts = await getContactsByUser(authSubject, { limit, skip, search });

        const { countContactsByUser } = await import('@/lib/db/contacts');
        const totalCount = await countContactsByUser(authSubject, { search });

        return NextResponse.json({
            contacts: contacts.map(toContactResponse),
            totalCount,
            limit,
            skip
        });
    } catch (error) {
        console.error('Error fetching contacts:', error);
        return NextResponse.json(
            { error: 'Failed to fetch contacts' },
            { status: 500 }
        );
    }
}
