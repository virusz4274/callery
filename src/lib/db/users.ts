import { getMongoDb, Collections } from '@/lib/mongodb';
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
        return { user: existingUser, wasCreated: false };
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
        const newUser = await createUser({
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
            transcriptionUsed: 0,
            transcriptionAllocation,
            totalContacts: 0,
            totalRecordings: 0,
            totalDuration: 0,
            trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
            lastLoginAt: new Date(),
        });

        return { user: newUser, wasCreated: true };
    } catch (error: unknown) {
        // Handle race condition: Duplicate key error (E11000) means user was created by another request
        const err = error as { code?: number; message?: string };
        if (err.code === 11000 || err.message?.includes('E11000') || err.message?.includes('duplicate key')) {
            const user = await findUserByFirebaseUid(firebaseUid);
            if (user) {
                return { user, wasCreated: false };
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
): Promise<void> {
    const db = await getMongoDb();

    await db.collection<User>(Collections.USERS).updateOne(
        { firebaseUid },
        {
            $inc: { storageUsed: bytes },
            $set: { updatedAt: new Date() }
        }
    );

    // TODO: [Stripe Hook] Report metered storage usage to Stripe
    // if (process.env.NEXT_PUBLIC_ENABLE_BILLING !== 'false' && user.stripeSubscriptionId && user.plan !== 'Free' && user.plan !== 'Free Trial' && user.plan !== 'Lifetime') {
    //     await stripe.subscriptionItems.createUsageRecord(
    //         'si_STORAGE_ITEM_ID', 
    //         { quantity: bytes, action: 'increment' }
    //     );
    // }
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

    // TODO: [Stripe Hook] Report metered transcription usage to Stripe
    // if (process.env.NEXT_PUBLIC_ENABLE_BILLING !== 'false' && user.stripeSubscriptionId && user.plan !== 'Free' && user.plan !== 'Free Trial' && user.plan !== 'Lifetime') {
    //    // Convert seconds to billed unit (e.g. minutes or seconds)
    //     await stripe.subscriptionItems.createUsageRecord(
    //         'si_TRANSCRIPTION_ITEM_ID', 
    //         { quantity: seconds, action: 'increment' }
    //     );
    // }
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
    // If no stripeCurrentPeriodEnd is set, we might need to initialize it.
    // For free trial users, this might not track a "billing" cycle in the traditional sense,
    // but we still want to reset monthly limits if we treat them as renewable (unlikely for trial, but good for structure).
    // However, the spec says "Usage resets monthly" for paid plans.
    // Trial is 30 days fixed. Let's assume this only applies if there's a recurring cycle intent.

    // If user is on a fixed trial (and not yet converted), we might NOT reset usage, 
    // OR we might just let it accumulate until the hard 30-day stop.
    // PLAN: Paid plans reset monthly. Trial plans do NOT reset (fixed 30 day window).

    if (user.plan === 'Free Trial' || user.plan === 'Free') {
        // Trial users: strict 30 day limit, usage does NOT reset monthly?
        // Actually, "Free Trial Duration: 30 days" -> usage resets monthly? No, usually trial is one-off.
        // If they are on "Free" (expired trial), they are blocked anyway.
        return user;
    }

    // For LifeTime, maybe we don't reset "usage" if it's pay-per-use?
    // "Existing data remains readable... Usage usage becomes metered... Usage resets monthly"
    // Actually the prompt says "Usage resets monthly for non-lifetime plans".
    // "Lifetime Plan... Every action is pay-per-use... No free storage/transcription minutes".
    // So for Lifetime, we might reset the "allocation" counters if we used them for free tiers, 
    // but really they have 0 free, so it's always metered.
    // Let's just reset the counter to keep it clean per month for reporting, 
    // OR if we want to track "Total Lifetime Usage", we shouldn't reset.
    // Requirement: "Usage resets monthly for non-lifetime plans".
    if (user.plan === 'Lifetime') {
        return user;
    }

    const now = new Date();
    // Default to 1 month from now if missing (should be set on upgrade)
    const currentPeriodEnd = user.stripeCurrentPeriodEnd ? new Date(user.stripeCurrentPeriodEnd) : null;

    if (!currentPeriodEnd || now > currentPeriodEnd) {
        console.log(`[checkAndResetUsageCycle] Resetting usage for user ${user._id}`);

        // Reset Logic
        const nextPeriodEnd = new Date();
        nextPeriodEnd.setDate(nextPeriodEnd.getDate() + 30); // Advance 30 days

        const db = await getMongoDb();

        // updateOne returns the WriteResult, NOT the document. 
        // We use findOneAndUpdate to get the new doc.
        const result = await db.collection<User>(Collections.USERS).findOneAndUpdate(
            { _id: user._id },
            {
                $set: {
                    transcriptionUsed: 0, // Reset monthly transcription usage
                    // Storage is usually persistent (accumulated), NOT reset monthly.
                    // "Storage limit (GB)... Usage resets monthly" -> This usually means "Transfer" reset, 
                    // BUT for storage it implies "Available Storage" vs "Used Storage". 
                    // Used storage definitely persists. The *limit* (allocation) grants you space.
                    // If you delete files, used goes down. 
                    // "Transcription minutes limit per month" -> THIS resets.
                    // "Storage usage tracking... Monthly reset logic for non-lifetime plans" 
                    // -> Wait, "Storage usage" doesn't reset unless files are deleted. 
                    // I will assume only Transcription resets. Storage is persistent state.
                    stripeCurrentPeriodEnd: nextPeriodEnd,
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
