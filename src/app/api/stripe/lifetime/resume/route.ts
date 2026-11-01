import { NextRequest, NextResponse } from 'next/server';
import { hasBlockingBillingReview } from '@/lib/stripe/financial-review';
import { env } from '@/lib/env';
import { getAuthSubjectFromSession, getUserFromRequest } from '@/lib/auth-utils';
import { findUserByAuthSubject } from '@/lib/db/users';
import { reconcileLifetimeUsage } from '@/lib/stripe/lifetime';
import { BillingBusyError } from '@/lib/stripe/billing-lock';
import { logger } from '@/lib/logger';
import { isOriginAllowed } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
    if (!env.NEXT_PUBLIC_ENABLE_BILLING) return NextResponse.json({ error: 'Billing is disabled on this instance.' }, { status: 403 });
    try {
        if (!req.headers.get('origin') || !isOriginAllowed(req.headers.get('origin'), new URL(env.NEXT_PUBLIC_APP_URL).origin)) {
            return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
        }
        const subject = await getAuthSubjectFromSession() || await getUserFromRequest(req);
        if (!subject) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const user = await findUserByAuthSubject(subject);
        if (!user?.lifetimePurchase || user.billingEntitlement?.source !== 'lifetime' || hasBlockingBillingReview(user.billingReview)
            || user.disabled || user.softDelete?.isDeleted || user.teamInvitationPending) {
            return NextResponse.json({ error: 'Lifetime usage billing is unavailable or needs administrator review.' }, { status: 403 });
        }
        const ready = await reconcileLifetimeUsage(subject, undefined, { resume: true });
        return NextResponse.json({ ready });
    } catch (error) {
        if (error instanceof BillingBusyError) return NextResponse.json({ error: error.message }, { status: 409 });
        logger.error('Lifetime usage billing recovery failed', error);
        return NextResponse.json({ error: 'Usage billing could not be updated. Please retry shortly.' }, { status: 503 });
    }
}
