import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth-utils';
import { findContactById } from '@/lib/db/contacts';
import { logger } from '@/lib/logger';
import { createGetContactHandler } from './handler';

const getContact = createGetContactHandler({ getUserFromRequest, findContactById });

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    try { return await getContact(request, context); }
    catch (error) {
        logger.error('Error fetching contact:', error);
        return NextResponse.json({ error: 'Failed to fetch contact' }, { status: 500 });
    }
}
