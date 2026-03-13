import type Stripe from 'stripe';
import { Collections, getMongoDb } from '@/lib/mongodb';
import type { User } from '@/lib/db/types';
import { resolveExternalServiceIncident, safelyReportExternalServiceIncident } from '@/lib/external-service-incidents';
import { stripe } from '@/lib/stripe';

type UserWithStripeCustomerSync = User & {
    stripeCustomerSync?: {
        lockedAt: Date;
    };
};

const CUSTOMER_CREATE_LOCK_TIMEOUT_MS = 30_000;
const CUSTOMER_CREATE_WAIT_MS = 250;
const CUSTOMER_CREATE_MAX_ATTEMPTS = 20;

function buildCustomerParams(user: User): Stripe.CustomerCreateParams {
    return {
        email: user.email,
        name: `${user.firstName} ${user.lastName}`.trim() || user.name,
        metadata: {
            firebaseUid: user.firebaseUid,
            userId: user._id.toString(),
        },
    };
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function ensureStripeCustomerId(user: User): Promise<string> {
    if (user.stripeCustomerId) {
        return user.stripeCustomerId;
    }

    const db = await getMongoDb();
    const users = db.collection<UserWithStripeCustomerSync>(Collections.USERS);

    for (let attempt = 0; attempt < CUSTOMER_CREATE_MAX_ATTEMPTS; attempt++) {
        const latestUser = await users.findOne({ _id: user._id });
        if (latestUser?.stripeCustomerId) {
            return latestUser.stripeCustomerId;
        }

        const staleLockBefore = new Date(Date.now() - CUSTOMER_CREATE_LOCK_TIMEOUT_MS);
        const claimedUser = await users.findOneAndUpdate(
            {
                _id: user._id,
                $and: [
                    {
                        $or: [
                            { stripeCustomerId: { $exists: false } },
                            { stripeCustomerId: '' },
                        ],
                    },
                    {
                        $or: [
                            { stripeCustomerSync: { $exists: false } },
                            { 'stripeCustomerSync.lockedAt': { $lt: staleLockBefore } },
                        ],
                    },
                ],
            },
            {
                $set: {
                    stripeCustomerSync: { lockedAt: new Date() },
                    updatedAt: new Date(),
                },
            },
            { returnDocument: 'after' }
        );

        if (claimedUser) {
            const customerPayload = buildCustomerParams(claimedUser);

            try {
                const customer = await stripe.customers.create(customerPayload, {
                    idempotencyKey: `stripe-customer:${claimedUser._id.toString()}`,
                });

                const assignedUser = await users.findOneAndUpdate(
                    {
                        _id: claimedUser._id,
                        $or: [
                            { stripeCustomerId: { $exists: false } },
                            { stripeCustomerId: '' },
                            { stripeCustomerId: customer.id },
                        ],
                    },
                    {
                        $set: {
                            stripeCustomerId: customer.id,
                            updatedAt: new Date(),
                        },
                        $unset: {
                            stripeCustomerSync: '',
                        },
                    },
                    { returnDocument: 'after' }
                );

                if (assignedUser?.stripeCustomerId) {
                    await resolveExternalServiceIncident({
                        provider: 'stripe',
                        operation: 'create_customer',
                    });
                    return assignedUser.stripeCustomerId;
                }

                const refreshedUser = await users.findOne({ _id: claimedUser._id });
                if (refreshedUser?.stripeCustomerId) {
                    await resolveExternalServiceIncident({
                        provider: 'stripe',
                        operation: 'create_customer',
                    });
                    return refreshedUser.stripeCustomerId;
                }

                throw new Error('Failed to persist Stripe customer ID');
            } catch (error) {
                await safelyReportExternalServiceIncident({
                    provider: 'stripe',
                    service: 'Stripe',
                    operation: 'create_customer',
                    error,
                    context: {
                        userId: claimedUser._id.toString(),
                        firebaseUid: claimedUser.firebaseUid,
                    },
                    notifyAdmins: true,
                });
                await users.updateOne(
                    { _id: claimedUser._id },
                    {
                        $unset: {
                            stripeCustomerSync: '',
                        },
                        $set: {
                            updatedAt: new Date(),
                        },
                    }
                );
                throw error;
            }
        }

        await sleep(CUSTOMER_CREATE_WAIT_MS);
    }

    const timeoutError = new Error('Timed out while creating Stripe customer');
    await safelyReportExternalServiceIncident({
        provider: 'stripe',
        service: 'Stripe',
        operation: 'create_customer',
        error: timeoutError,
        context: {
            userId: user._id.toString(),
            firebaseUid: user.firebaseUid,
        },
        notifyAdmins: true,
    });
    throw timeoutError;
}
