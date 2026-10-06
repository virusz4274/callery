import { Collections, getMongoDb } from '@/lib/mongodb';
import type { CreateUserInput, Plan, SystemSettings, UpdateUserInput, User } from '../types';
import { getPlanDisplayName } from '@/lib/plans';

const DB_INIT_INSTRUCTIONS = 'Run `pnpm db:init` before using the app with a fresh database.';

/**
 * Find a user by their authentication subject.
 */
export async function findUserByAuthSubject(authSubject: string): Promise<User | null> {
    const db = await getMongoDb();
    return db.collection<User>(Collections.USERS).findOne({ authSubject });
}

/**
 * Find a user by their Stripe Customer ID.
 */
export async function findUserByStripeCustomerId(customerId: string): Promise<User | null> {
    const db = await getMongoDb();
    return db.collection<User>(Collections.USERS).findOne({ stripeCustomerId: customerId });
}

/**
 * Create a new user profile.
 */
export async function createUser(data: CreateUserInput): Promise<User> {
    const db = await getMongoDb();
    const now = new Date();

    const userDoc = {
        ...data,
        createdAt: now,
        updatedAt: now,
    };

    const result = await db.collection<User>(Collections.USERS).insertOne(userDoc as User);

    return {
        ...userDoc,
        _id: result.insertedId,
    } as User;
}

/**
 * Update an existing user profile.
 */
export async function updateUser(authSubject: string, data: UpdateUserInput): Promise<User | null> {
    const db = await getMongoDb();

    return db.collection<User>(Collections.USERS).findOneAndUpdate(
        { authSubject },
        {
            $set: {
                ...data,
                updatedAt: new Date(),
            },
        },
        { returnDocument: 'after' }
    );
}

/**
 * Get a plan by ID.
 */
export async function getPlanById(planId: SystemSettings['defaultPlanId']): Promise<Plan | null> {
    if (!planId) {
        return null;
    }

    const db = await getMongoDb();
    return db.collection<Plan>(Collections.PLANS).findOne({ _id: planId });
}

export async function getPlanByKey(planKey: string): Promise<Plan | null> {
    const db = await getMongoDb();
    return db.collection<Plan>(Collections.PLANS).findOne({ key: planKey });
}

/**
 * Get system settings (singleton document).
 */
export async function getSystemSettings(): Promise<SystemSettings | null> {
    const db = await getMongoDb();
    return db.collection<SystemSettings>(Collections.SYSTEM_SETTINGS).findOne({});
}

export async function getRequiredSystemSettings(): Promise<SystemSettings> {
    const settings = await getSystemSettings();
    if (!settings) {
        throw new Error(`System settings are missing. ${DB_INIT_INSTRUCTIONS}`);
    }

    return settings;
}

export async function getRequiredDefaultPlan(): Promise<Plan> {
    const settings = await getRequiredSystemSettings();
    if (!settings.defaultPlanId) {
        throw new Error(`Default plan is not configured in system settings. ${DB_INIT_INSTRUCTIONS}`);
    }

    const defaultPlan = await getPlanById(settings.defaultPlanId);
    if (!defaultPlan) {
        throw new Error(`Default plan document is missing. ${DB_INIT_INSTRUCTIONS}`);
    }

    return defaultPlan;
}

export async function getPlanNameMap(planKeys: string[]): Promise<Map<string, string>> {
    const uniqueKeys = [...new Set(planKeys.filter(Boolean))];
    if (uniqueKeys.length === 0) {
        return new Map();
    }

    const db = await getMongoDb();
    const plans = await db
        .collection<Plan>(Collections.PLANS)
        .find({ key: { $in: uniqueKeys } }, { projection: { key: 1, name: 1 } })
        .toArray();

    const planNameMap = new Map<string, string>();
    for (const plan of plans) {
        planNameMap.set(plan.key, plan.name);
    }

    for (const key of uniqueKeys) {
        if (!planNameMap.has(key)) {
            planNameMap.set(key, getPlanDisplayName(key));
        }
    }

    return planNameMap;
}
