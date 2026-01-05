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
        firebaseUid: contact.firebaseUid,
        name: contact.name,
        phoneNumber: contact.phoneNumber,
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
    const firebaseUid = await getUserFromRequest(request);

    if (!firebaseUid) {
        return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
        );
    }

    try {
        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get('limit') || '20', 10);
        const skip = parseInt(searchParams.get('skip') || '0', 10);

        const contacts = await getContactsByUser(firebaseUid, { limit, skip });

        // We probably want the total count of contacts for this user too, 
        // effectively another query if we want "real" total vs "fetched" length.
        // For infinite scroll, totalCount helps know when to stop.
        // Let's add a quick count query or reuse logic if we had one. 
        // Re-using the logic from the route to count documents.

        // Since getContactsByUser returns the array, we need a separate count if we paginating.
        // Let's assume we can get it from the db directly or add a count function.
        // For now, I'll add a quick count query here, but ideally should be in db layer.

        // Wait, looking at getContactsByUser, it sorts by name. 
        // Let's just do a count here.
        const { countContactsByUser } = await import('@/lib/db/contacts');
        const totalCount = await countContactsByUser(firebaseUid);

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
