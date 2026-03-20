
import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth-utils';
import { findUserByFirebaseUid, setStoragePeakUsed } from '@/lib/db/users';
import { env } from '@/lib/env';
import { getMongoDb, Collections } from '@/lib/mongodb';
import { User } from '@/lib/db/types';
import { reportUsage } from '@/lib/stripe/usage';
import { ensureStripeCustomerId } from '@/lib/stripe/customer';
import { isFreeTrialPlanKey } from '@/lib/plans';

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

        const user = await findUserByFirebaseUid(uid);
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Trial users cannot enable overage
        if (isFreeTrialPlanKey(user.planKey)) {
            return NextResponse.json({ error: 'Pay Per Usage cannot be enabled on Free Trial.' }, { status: 403 });
        }

        if (allowOverage && !user.stripeCustomerId) {
            try {
                await ensureStripeCustomerId(user);
            } catch (error) {
                console.error('Error creating Stripe customer before enabling overage:', error);
                return NextResponse.json(
                    { error: 'Unable to enable Pay Per Usage right now. Please try again in a moment.' },
                    { status: 503 }
                );
            }
        }

        // Use direct update since our generic `updateUser` might not deep merge 'billingSettings' if it's new
        const db = await getMongoDb();
        await db.collection<User>(Collections.USERS).updateOne(
            { firebaseUid: uid },
            {
                $set: {
                    'billingSettings.allowOverage': allowOverage,
                    updatedAt: new Date(),
                }
            }
        );

        // If overage is enabled, send a baseline storage event so Stripe has usage for this period.
        if (allowOverage) {
            const refreshedUser = await findUserByFirebaseUid(uid);
            if (refreshedUser) {
                const periodEnd = refreshedUser.stripeCurrentPeriodEnd
                    ? new Date(refreshedUser.stripeCurrentPeriodEnd)
                    : undefined;
                await setStoragePeakUsed(uid, refreshedUser.storageUsed || 0, periodEnd);
                await reportUsage(uid, 'storage', refreshedUser.storageUsed || 0, {
                    identifier: `storage:${uid}:overage-enabled:${periodEnd?.toISOString() ?? 'none'}:${refreshedUser.storageUsed || 0}`,
                });
            }
        }

        return NextResponse.json({ success: true, allowOverage });

    } catch (error) {
        console.error('Error updating billing settings:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
