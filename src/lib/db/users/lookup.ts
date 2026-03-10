import { Collections, getMongoDb } from '@/lib/mongodb';
import type { CreateUserInput, Plan, SystemSettings, UpdateUserInput, User } from '../types';

/**
 * Find a user by their Firebase UID.
 */
export async function findUserByFirebaseUid(firebaseUid: string): Promise<User | null> {
    const db = await getMongoDb();
    return db.collection<User>(Collections.USERS).findOne({ firebaseUid });
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
export async function updateUser(firebaseUid: string, data: UpdateUserInput): Promise<User | null> {
    const db = await getMongoDb();

    return db.collection<User>(Collections.USERS).findOneAndUpdate(
        { firebaseUid },
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

/**
 * Get system settings (singleton document).
 */
export async function getSystemSettings(): Promise<SystemSettings | null> {
    const db = await getMongoDb();
    return db.collection<SystemSettings>(Collections.SYSTEM_SETTINGS).findOne({});
}
