import type Stripe from 'stripe';
import { randomUUID } from 'node:crypto';
import type { BillingDependencies } from './runtime';
import { Collections, getMongoDb } from '@/lib/mongodb';
import type { User } from '@/lib/db/types';
import { resolveExternalServiceIncident, safelyReportExternalServiceIncident } from '@/lib/external-service-incidents';
import { getStripe } from '@/lib/stripe';

type UserWithStripeCustomerSync = User & {
    stripeCustomerSync?: {
        lockedAt: Date;
        owner?: string;
        attemptId?: string;
        params?: Stripe.CustomerCreateParams;
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
            authSubject: user.authSubject,
            userId: user._id.toString(),
        },
    };
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function ensureStripeCustomerId(user: User, dependencies?: BillingDependencies): Promise<string> {
    if (user.stripeCustomerId) {
        return user.stripeCustomerId;
    }

    const db = dependencies?.db || await getMongoDb();
    const stripe = dependencies?.stripe || getStripe();
    const users = db.collection<UserWithStripeCustomerSync>(Collections.USERS);

    for (let attempt = 0; attempt < CUSTOMER_CREATE_MAX_ATTEMPTS; attempt++) {
        const latestUser = await users.findOne({ _id: user._id });
        if (latestUser?.stripeCustomerId) {
            return latestUser.stripeCustomerId;
        }

        const staleLockBefore = new Date(Date.now() - CUSTOMER_CREATE_LOCK_TIMEOUT_MS);
        const owner = randomUUID();
        const attemptId = latestUser?.stripeCustomerSync?.attemptId || randomUUID();
        const customerParams = latestUser?.stripeCustomerSync?.params || buildCustomerParams(latestUser || user);
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
                    stripeCustomerSync: { lockedAt: new Date(), owner, attemptId, params: customerParams },
                    updatedAt: new Date(),
                },
            },
            { returnDocument: 'after' }
        );

        if (claimedUser) {
            const customerPayload = claimedUser.stripeCustomerSync!.params!;

            try {
                const customer = await stripe.customers.create(customerPayload, {
                    idempotencyKey: `stripe-customer:${claimedUser._id.toString()}:${claimedUser.stripeCustomerGeneration || 0}:${attemptId}`,
                });

                const assignedUser = await users.findOneAndUpdate(
                    {
                        _id: claimedUser._id,
                        'stripeCustomerSync.owner': owner,
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
                    if (!dependencies) await resolveExternalServiceIncident({
                        provider: 'stripe',
                        operation: 'create_customer',
                    });
                    return assignedUser.stripeCustomerId;
                }

                const refreshedUser = await users.findOne({ _id: claimedUser._id });
                if (refreshedUser?.stripeCustomerId) {
                    if (!dependencies) await resolveExternalServiceIncident({
                        provider: 'stripe',
                        operation: 'create_customer',
                    });
                    return refreshedUser.stripeCustomerId;
                }

                throw new Error('Failed to persist Stripe customer ID');
            } catch (error) {
                if (!dependencies) await safelyReportExternalServiceIncident({
                    provider: 'stripe',
                    service: 'Stripe',
                    operation: 'create_customer',
                    error,
                    context: {
                        userId: claimedUser._id.toString(),
                        authSubject: claimedUser.authSubject,
                    },
                    notifyAdmins: true,
                });
                await users.updateOne(
                    { _id: claimedUser._id, 'stripeCustomerSync.owner': owner },
                    {
                        $set: { 'stripeCustomerSync.lockedAt': new Date(0), updatedAt: new Date() },
                    }
                );
                throw error;
            }
        }

        await sleep(CUSTOMER_CREATE_WAIT_MS);
    }

    const timeoutError = new Error('Timed out while creating Stripe customer');
    if (!dependencies) await safelyReportExternalServiceIncident({
        provider: 'stripe',
        service: 'Stripe',
        operation: 'create_customer',
        error: timeoutError,
        context: {
            userId: user._id.toString(),
            authSubject: user.authSubject,
        },
        notifyAdmins: true,
    });
    throw timeoutError;
}
