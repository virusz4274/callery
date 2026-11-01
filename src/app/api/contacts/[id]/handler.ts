import { ObjectId } from 'mongodb';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { Contact } from '@/lib/db/types';
import { toContactResponse } from '@/lib/db/converters';

interface ContactDetailDependencies {
    getUserFromRequest(request: NextRequest): Promise<string | null>;
    findContactById(subject: string, id: string): Promise<Contact | null>;
}

export function createGetContactHandler(dependencies: ContactDetailDependencies) {
    return async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
        const subject = await dependencies.getUserFromRequest(request);
        if (!subject) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const { id } = await context.params;
        if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid contact ID' }, { status: 400 });
        const contact = await dependencies.findContactById(subject, id);
        // Keep the directory owner-scoped, including for company administrators.
        if (!contact || contact.authSubject !== subject) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
        return NextResponse.json({ contact: toContactResponse(contact) });
    };
}
