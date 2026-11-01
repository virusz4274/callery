import type Stripe from 'stripe';
import type { Db } from 'mongodb';
import { getMongoDb } from '@/lib/mongodb';
import { getStripe } from '@/lib/stripe';
import { ensureBillingIndexes } from './database';

export interface BillingDependencies { db: Db; stripe: Stripe }
export async function billingDependencies(dependencies?: BillingDependencies): Promise<BillingDependencies> {
    if (dependencies) return dependencies;
    const db = await getMongoDb();
    await ensureBillingIndexes(db);
    return { db, stripe: getStripe() };
}
