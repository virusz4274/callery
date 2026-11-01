import { randomUUID } from 'node:crypto';
import type { Db, Filter } from 'mongodb';
import { Collections } from '@/lib/mongodb';
import type { User } from '@/lib/db/types';
import { DELETED_BILLING_ACCOUNTS } from './financial-settlement';

export class BillingBusyError extends Error {
    constructor() { super('Billing is updating. Please retry shortly.'); }
}
const LEASE_MS = 5 * 60_000;

/** Fencing also prevents a concurrent administrator grant being overwritten. */
export function billingFence(user: User, owner: string): Filter<User> {
    return {
        _id: user._id,
        'stripeBillingLease.owner': owner,
        'stripeBillingLease.until': { $gt: new Date() },
        'billingEntitlement.source': user.billingEntitlement?.source ?? { $exists: false },
        'billingEntitlement.reference': user.billingEntitlement?.reference ?? { $exists: false },
        'billingEntitlement.grantedAt': user.billingEntitlement?.grantedAt ?? { $exists: false },
        stripeCustomerId: user.stripeCustomerId ?? { $exists: false },
        stripeCustomerGeneration: user.stripeCustomerGeneration ?? { $exists: false },
        disabled: user.disabled ?? { $exists: false },
        'softDelete.isDeleted': user.softDelete?.isDeleted ?? { $exists: false },
        'billingRecovery.purgingAt': user.billingRecovery?.purgingAt ?? { $exists: false },
    };
}

/** One atomic user-document lease works on standalone MongoDB, without transactions. */
export async function withBillingLease<T>(db: Db, subject: string, work: (user: User, owner: string) => Promise<T>): Promise<T> {
    const owner = randomUUID();
    const users = db.collection<User>(await db.collection<User>(Collections.USERS).findOne({ authSubject: subject })
        ? Collections.USERS : DELETED_BILLING_ACCOUNTS);
    const now = new Date();
    const user = await users.findOneAndUpdate({ authSubject: subject, $or: [
        { stripeBillingLease: { $exists: false } }, { 'stripeBillingLease.until': { $lte: now } },
    ] }, { $set: { stripeBillingLease: { owner, until: new Date(now.getTime() + LEASE_MS) } } }, { returnDocument: 'after' });
    if (!user) throw new BillingBusyError();
    const heartbeat = setInterval(() => {
        void users.updateOne({ _id: user._id, 'stripeBillingLease.owner': owner }, {
            $set: { 'stripeBillingLease.until': new Date(Date.now() + LEASE_MS) },
        }).catch(() => {});
    }, 30_000);
    heartbeat.unref();
    try { return await work(user, owner); }
    finally {
        clearInterval(heartbeat);
        await users.updateOne({ _id: user._id, 'stripeBillingLease.owner': owner }, { $unset: { stripeBillingLease: '' } });
    }
}
