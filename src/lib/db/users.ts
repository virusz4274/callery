import { getMongoDb, Collections } from '@/lib/mongodb';
import { logger } from '@/lib/logger';
import type { User, CreateUserInput, UpdateUserInput, SystemSettings, Plan } from './types';

/**
 * Find a user by their Firebase UID.
 */
export async function findUserByFirebaseUid(firebaseUid: string): Promise<User | null> {
    const db = await getMongoDb();
    const user = await db.collection<User>(Collections.USERS).findOne({ firebaseUid });
    return user;
}

/**
 * Create a new user profile.
 * Called when a user signs up or first logs in.
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
export async function updateUser(
    firebaseUid: string,
    data: UpdateUserInput
): Promise<User | null> {
    const db = await getMongoDb();

    const result = await db.collection<User>(Collections.USERS).findOneAndUpdate(
        { firebaseUid },
        {
            $set: {
                ...data,
                updatedAt: new Date(),
            }
        },
        { returnDocument: 'after' }
    );

    return result;
}



/**
 * Helper to ensure a user has a Stripe Customer ID.
 */
async function ensureStripeCustomer(user: User): Promise<User> {
    // 1. Check if billing is enabled
    if (process.env.NEXT_PUBLIC_ENABLE_BILLING === 'false') {
        return user;
    }

    // 2. Check if already has ID
    if (user.stripeCustomerId) {
        return user;
    }

    try {
        // 3. Import Stripe (lazy load to avoid init issues if disabled)
        const { stripe } = await import('@/lib/stripe');
        const db = await getMongoDb();

        logger.info(`[ensureStripeCustomer] Creating Stripe Customer for ${user._id}`);

        // 4. Create Stripe Customer
        const customer = await stripe.customers.create({
            email: user.email,
            name: `${user.firstName} ${user.lastName}`.trim() || user.name,
            metadata: {
                firebaseUid: user.firebaseUid,
                userId: user._id.toString(),
            },
        });

        // 5. Update DB
        // We use findOneAndUpdate to get the fresh document
        const result = await db.collection<User>(Collections.USERS).findOneAndUpdate(
            { _id: user._id },
            { $set: { stripeCustomerId: customer.id, updatedAt: new Date() } },
            { returnDocument: 'after' }
        );

        if (result) {
            logger.info(`[ensureStripeCustomer] Created Stripe Customer ID: ${customer.id}`);
            return result as User;
        }

    } catch (error) {
        logger.error(`[ensureStripeCustomer] Failed to create Stripe ID for ${user._id}:`, error);
        // We don't throw here to avoid blocking login, but Portal will fail later.
    }

    return user;
}

/**
 * Ensure a user profile exists, creating one if necessary.
 * This is called after Firebase Auth login.
 * Returns true if a new profile was created, false if it already existed.
 */
export async function ensureUserProfile(
    firebaseUid: string,
    email: string,
    displayName?: string,
    photoURL?: string
): Promise<{ user: User; wasCreated: boolean }> {
    const existingUser = await findUserByFirebaseUid(firebaseUid);

    if (existingUser) {
        // Ensure Stripe ID exists (BACKFILL for existing users)
        const updatedUser = await ensureStripeCustomer(existingUser);
        return { user: updatedUser, wasCreated: false };
    }

    const db = await getMongoDb();

    // Check system settings for signup allow/deny and default plan
    const settings = await db.collection<SystemSettings>(Collections.SYSTEM_SETTINGS).findOne({});

    if (settings && !settings.allowSignups) {
        throw new Error('New signups are currently disabled.');
    }

    // Default values (fallback)
    let planName = 'Free Trial';
    let storageAllocation = 5 * 1024 * 1024 * 1024; // 5GB
    let transcriptionAllocation = 3600; // 60 minutes

    // Fetch default plan if configured
    if (settings?.defaultPlanId) {
        const defaultPlan = await db.collection<Plan>(Collections.PLANS).findOne({ _id: settings.defaultPlanId });
        if (defaultPlan) {
            planName = defaultPlan.name;
            storageAllocation = defaultPlan.limits.storage;
            transcriptionAllocation = defaultPlan.limits.transcription;
        }
    }

    // Parse display name into first/last
    const nameParts = (displayName || '').split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    try {
        let newUser = await createUser({
            firebaseUid,
            email,
            firstName,
            lastName,
            name: displayName || email.split('@')[0],
            phoneNumber: '',
            photoURL: photoURL || '',
            role: 'user',
            plan: planName,
            timezone: '',
            notificationSettings: {
                activityDigest: 'weekly',
                ingestSuccess: true,
                ingestFail: true,
            },
            transcriptionSettings: {
                autoTranscribe: true,
            },
            storageSettings: {
                deletionPolicy: 'never',
            },
            billingSettings: {
                allowOverage: false,
            },
            storageUsed: 0,
            storageAllocation,
            storagePeakUsed: 0,
            transcriptionUsed: 0,
            transcriptionAllocation,
            totalContacts: 0,
            totalRecordings: 0,
            totalDuration: 0,
            trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
            lastLoginAt: new Date(),
        });

        // Ensure Stripe ID exists (NEW users)
        newUser = await ensureStripeCustomer(newUser);

        return { user: newUser, wasCreated: true };
    } catch (error: unknown) {
        // Handle race condition: Duplicate key error (E11000) means user was created by another request
        const err = error as { code?: number; message?: string };
        if (err.code === 11000 || err.message?.includes('E11000') || err.message?.includes('duplicate key')) {
            const user = await findUserByFirebaseUid(firebaseUid);
            if (user) {
                // Determine if we need to backfill the racer too
                const updatedUser = await ensureStripeCustomer(user);
                return { user: updatedUser, wasCreated: false };
            }
        }
        throw error;
    }
}

/**
 * Increment the user's storage used counter.
 */
export async function incrementStorageUsed(
    firebaseUid: string,
    bytes: number
): Promise<User | null> {
    const db = await getMongoDb();

    const result = await db.collection<User>(Collections.USERS).findOneAndUpdate(
        { firebaseUid },
        {
            $inc: { storageUsed: bytes },
            $set: { updatedAt: new Date() }
        },
        { returnDocument: 'after' }
    );

    return result as User | null;
}

/**
 * Decrement the user's storage used counter.
 */
export async function decrementStorageUsed(
    firebaseUid: string,
    bytes: number
): Promise<void> {
    const db = await getMongoDb();

    await db.collection<User>(Collections.USERS).updateOne(
        { firebaseUid },
        {
            $inc: { storageUsed: -bytes },
            $set: { updatedAt: new Date() }
        }
    );
}

/**
 * Update the user's storage peak usage for the current billing period.
 * Should be called when storage usage increases or when a new period begins.
 */
export async function setStoragePeakUsed(
    firebaseUid: string,
    peakBytes: number,
    periodEnd?: Date
): Promise<User | null> {
    const db = await getMongoDb();
    const updateData: Record<string, unknown> = {
        storagePeakUsed: peakBytes,
        updatedAt: new Date(),
    };

    if (periodEnd) {
        updateData.storagePeakPeriodEnd = periodEnd;
    }

    const result = await db.collection<User>(Collections.USERS).findOneAndUpdate(
        { firebaseUid },
        { $set: updateData },
        { returnDocument: 'after' }
    );

    return result as User | null;
}

/**
 * Bump the storage peak only if the new value is higher.
 * Returns true if the peak was updated.
 */
export async function bumpStoragePeakUsed(
    firebaseUid: string,
    peakBytes: number,
    periodEnd?: Date
): Promise<boolean> {
    const db = await getMongoDb();
    const updateData: Record<string, unknown> = {
        storagePeakUsed: peakBytes,
        updatedAt: new Date(),
    };

    if (periodEnd) {
        updateData.storagePeakPeriodEnd = periodEnd;
    }

    const result = await db.collection<User>(Collections.USERS).findOneAndUpdate(
        {
            firebaseUid,
            $or: [
                { storagePeakUsed: { $exists: false } },
                { storagePeakUsed: { $lt: peakBytes } },
            ],
        },
        { $set: updateData },
        { returnDocument: 'after' }
    );

    return !!result;
}

/**
 * Increment the user's transcription usage counter.
 * @param seconds - The number of seconds to add (should be the billed duration)
 */
export async function incrementTranscriptionUsed(
    firebaseUid: string,
    seconds: number
): Promise<void> {
    const db = await getMongoDb();

    await db.collection<User>(Collections.USERS).updateOne(
        { firebaseUid },
        {
            $inc: { transcriptionUsed: seconds },
            $set: { updatedAt: new Date() }
        }
    );
}

/**
 * Increment the user's contact count.
 */
export async function incrementContactCount(
    firebaseUid: string,
    count: number
): Promise<void> {
    const db = await getMongoDb();

    await db.collection<User>(Collections.USERS).updateOne(
        { firebaseUid },
        {
            $inc: { totalContacts: count },
            $set: { updatedAt: new Date() }
        }
    );
}

/**
 * Update the user's recording statistics.
 */
export async function updateUserRecordingStats(
    firebaseUid: string,
    change: { count: number; duration: number }
): Promise<void> {
    const db = await getMongoDb();

    await db.collection<User>(Collections.USERS).updateOne(
        { firebaseUid },
        {
            $inc: {
                totalRecordings: change.count,
                totalDuration: change.duration,
            },
            $set: { updatedAt: new Date() }
        }
    );
}
/**
 * Check if the user's billing cycle has ended and reset usage if necessary.
 * This should be called before any usage-metered action (upload, transcribe).
 */
export async function checkAndResetUsageCycle(user: User): Promise<User> {
    // Requirement: "Usage resets monthly for non-lifetime plans".

    if (user.plan === 'Free Trial' || user.plan === 'Free') {
        // Trial users: strict 30 day limit, usage does NOT reset monthly?
        // If they are on "Free" (expired trial), they are blocked anyway.
        return user;
    }

    if (user.plan === 'Lifetime') {
        // Lifetime Plan: No free storage/transcription minutes, so usage resetting is less critical but good for cleanup.
        return user;
    }

    const now = new Date();
    // Default to 1 month from now if missing (should be set on upgrade)
    const currentPeriodEnd = user.stripeCurrentPeriodEnd ? new Date(user.stripeCurrentPeriodEnd) : null;

    if (!currentPeriodEnd || now > currentPeriodEnd) {
        logger.info(`[checkAndResetUsageCycle] Resetting usage for user ${user._id}`);

        // Reset Logic
        const nextPeriodEnd = new Date();
        nextPeriodEnd.setDate(nextPeriodEnd.getDate() + 30); // Advance 30 days

        const db = await getMongoDb();

        // We use findOneAndUpdate to get the new doc.
        const result = await db.collection<User>(Collections.USERS).findOneAndUpdate(
            { _id: user._id },
            {
                $set: {
                    transcriptionUsed: 0, // Reset monthly transcription usage
                    stripeCurrentPeriodEnd: nextPeriodEnd,
                    storagePeakUsed: user.storageUsed,
                    storagePeakPeriodEnd: nextPeriodEnd,
                    updatedAt: new Date(),
                }
            },
            { returnDocument: 'after' }
        );

        if (result) {
            return result as User;
        }
    }

    return user;
}

/**
 * Get system settings (singleton document).
 */
export async function getSystemSettings(): Promise<SystemSettings | null> {
    const db = await getMongoDb();
    const settings = await db.collection<SystemSettings>(Collections.SYSTEM_SETTINGS).findOne({});
    return settings;
}

