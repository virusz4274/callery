import { logger } from '@/lib/logger';

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth-utils';
import { findUserByAuthSubject, setStoragePeakUsed } from '@/lib/db/users';
import { env } from '@/lib/env';
import { getMongoDb, Collections } from '@/lib/mongodb';
import { User } from '@/lib/db/types';
import { reportUsage } from '@/lib/stripe/usage';
import { isFreeTrialPlanKey } from '@/lib/plans';
import { canUseMeteredOverage } from '@/lib/access-control-common';

export async function PATCH(req: NextRequest) {
    // Check for Self-Hosted Mode (Billing Disabled)
    if (!env.NEXT_PUBLIC_ENABLE_BILLING) {
        return NextResponse.json({ error: 'Billing is disabled on this instance.' }, { status: 403 });
    }

    try {
        const uid = await getUserFromRequest(req);
        if (!uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { allowOverage } = body;

        if (typeof allowOverage !== 'boolean') {
            return NextResponse.json({ error: 'Invalid value for allowOverage' }, { status: 400 });
        }

        const user = await findUserByAuthSubject(uid);
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Trial users cannot enable overage
        if (isFreeTrialPlanKey(user.planKey)) {
            return NextResponse.json({ error: 'Pay Per Usage cannot be enabled on Free Trial.' }, { status: 403 });
        }
        if (!allowOverage && user.billingEntitlement?.source === 'lifetime') {
            return NextResponse.json({ error: 'Lifetime access includes separately billed usage. Manage or cancel usage billing through the billing portal.', code: 'lifetime_usage_required' }, { status: 409 });
        }

        if (allowOverage && !canUseMeteredOverage({ ...user, billingSettings: { allowOverage: true } })) {
            return NextResponse.json({ error: 'An active subscription with verified usage billing is required before enabling Pay Per Usage.', code: 'usage_billing_not_ready' }, { status: 409 });
        }

        // Use direct update since our generic `updateUser` might not deep merge 'billingSettings' if it's new
        const db = await getMongoDb();
        const updated = await db.collection<User>(Collections.USERS).updateOne(
            { authSubject: uid, ...(allowOverage ? {
                stripeSubscriptionStatus: 'active',
                stripeSubscriptionId: user.stripeSubscriptionId,
                stripeMetering: user.stripeMetering,
                billingEntitlement: user.billingEntitlement,
                billingReview: user.billingReview ?? { $exists: false },
                'billingAccount.costReview': user.billingAccount?.costReview ?? { $exists: false },
                stripePaymentIssues: user.stripePaymentIssues ?? { $exists: false },
            } : {}) },
            {
                $set: {
                    'billingSettings.allowOverage': allowOverage,
                    updatedAt: new Date(),
                }
            }
        );
        if (!updated.matchedCount) return NextResponse.json({ error: 'Billing changed while saving. Refresh and try again.', code: 'billing_changed' }, { status: 409 });

        // If overage is enabled, send a baseline storage event so Stripe has usage for this period.
        if (allowOverage) {
            const refreshedUser = await findUserByAuthSubject(uid);
            if (refreshedUser) {
                const periodEnd = refreshedUser.stripeCurrentPeriodEnd
                    ? new Date(refreshedUser.stripeCurrentPeriodEnd)
                    : undefined;
                await setStoragePeakUsed(uid, refreshedUser.storageUsed, periodEnd);
                await reportUsage(uid, 'storage', refreshedUser.storageUsed, {
                    identifier: `storage:${uid}:overage-enabled:${periodEnd?.toISOString() ?? 'none'}:${refreshedUser.storageUsed}`,
                });
            }
        }

        return NextResponse.json({ success: true, allowOverage });

    } catch (error) {
        logger.error('Error updating billing settings:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
