import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { getAuthSubjectFromSession, getUserFromRequest } from '@/lib/auth-utils';
import { findUserByAuthSubject } from '@/lib/db/users';
import { isOriginAllowed } from '@/lib/rate-limit';
import { BillingBusyError } from './billing-lock';
import { BillingConfigurationError } from './metering';
import { BillingChangeError } from './plan-change';
import { logger } from '@/lib/logger';
import { BillingSyncPendingError } from './subscription-schedule';

export async function requireBillingUser(req: NextRequest, mutation = true) {
    if (!env.NEXT_PUBLIC_ENABLE_BILLING) throw new BillingChangeError('Billing is disabled on this instance.', 403);
    if (mutation && (!req.headers.get('origin') || !isOriginAllowed(req.headers.get('origin'), new URL(env.NEXT_PUBLIC_APP_URL).origin))) {
        throw new BillingChangeError('Invalid request origin.', 403);
    }
    const subject = await getAuthSubjectFromSession() || await getUserFromRequest(req);
    if (!subject) throw new BillingChangeError('Unauthorized', 401);
    const user = await findUserByAuthSubject(subject);
    if (!user || user.disabled || user.softDelete?.isDeleted || user.teamInvitationPending) throw new BillingChangeError('Account unavailable.', 403);
    return user;
}
export function billingErrorResponse(error: unknown) {
    if (error instanceof BillingSyncPendingError) return NextResponse.json({ error: error.message, code: error.code, retryable: true }, { status: 409 });
    if (error instanceof BillingChangeError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof BillingBusyError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof BillingConfigurationError) return NextResponse.json({ error: error.message }, { status: 400 });
    logger.error('Billing request could not be completed', error);
    return NextResponse.json({ error: 'Billing could not be updated. The request is retained for recovery; please retry shortly.' }, { status: 503 });
}
