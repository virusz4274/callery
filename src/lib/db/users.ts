import { getMongoDb, Collections } from '@/lib/mongodb';
import { billingEnabled, transcriptionMultiplier, type TranscriptionProvider } from '@/lib/config';
import { calculateBilledDuration } from '@/lib/utils/billing';
import { logger } from '@/lib/logger';
import type { User, CreateUserInput, UpdateUserInput, SystemSettings, Plan } from './types';

/**
 * Find a user by their Firebase UID.
 */
export async function findUserByAuthSubject(authSubject: string): Promise<User | null> {
    const db = await getMongoDb();
    const user = await db.collection<User>(Collections.USERS).findOne({ authSubject });
    return user;
}

/**
 * Set a user's role directly. Used for auth bootstrap (e.g. ADMIN_EMAILS);
 * admin-initiated changes go through the audited admin action instead.
 */
export async function setUserRole(authSubject: string, role: 'user' | 'admin'): Promise<void> {
    const db = await getMongoDb();
    await db.collection<User>(Collections.USERS).updateOne(
        { authSubject },
        { $set: { role, updatedAt: new Date() } }
    );
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
    authSubject: string,
    data: UpdateUserInput
): Promise<User | null> {
    const db = await getMongoDb();

    const result = await db.collection<User>(Collections.USERS).findOneAndUpdate(
        { authSubject },
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
    if (!billingEnabled()) {
        return user;
    }

    // 2. Check if already has ID
    if (user.stripeCustomerId) {
        return user;
    }

    try {
        // 3. Import Stripe (lazy load to avoid init issues if disabled)
        const { getStripe } = await import('@/lib/stripe');
        const stripe = getStripe();
        const db = await getMongoDb();

        logger.info(`[ensureStripeCustomer] Creating Stripe Customer for ${user._id}`);

        // 4. Create Stripe Customer
        const customer = await stripe.customers.create({
            email: user.email,
            name: `${user.firstName} ${user.lastName}`.trim() || user.name,
            metadata: {
                authSubject: user.authSubject,
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
 * This is called after auth login (any provider).
 * Returns true if a new profile was created, false if it already existed.
 */
export async function ensureUserProfile(
    authSubject: string,
    email: string,
    displayName?: string,
    photoURL?: string,
    authProvider: 'firebase' | 'local' = 'firebase'
): Promise<{ user: User; wasCreated: boolean }> {
    const existingUser = await findUserByAuthSubject(authSubject);

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
            authSubject,
            authProvider,
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

        // Ensure Stripe ID exists (NEW users)
        newUser = await ensureStripeCustomer(newUser);

        return { user: newUser, wasCreated: true };
    } catch (error: unknown) {
        // Handle race condition: Duplicate key error (E11000) means user was created by another request
        const err = error as { code?: number; message?: string };
        if (err.code === 11000 || err.message?.includes('E11000') || err.message?.includes('duplicate key')) {
            const user = await findUserByAuthSubject(authSubject);
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
    authSubject: string,
    bytes: number
): Promise<void> {
    const db = await getMongoDb();

    await db.collection<User>(Collections.USERS).updateOne(
        { authSubject },
        {
            $inc: { storageUsed: bytes },
            $set: { updatedAt: new Date() }
        }
    );
}

/**
 * Decrement the user's storage used counter.
 */
export async function decrementStorageUsed(
    authSubject: string,
    bytes: number
): Promise<void> {
    const db = await getMongoDb();

    await db.collection<User>(Collections.USERS).updateOne(
        { authSubject },
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
    authSubject: string,
    seconds: number
): Promise<void> {
    const db = await getMongoDb();

    await db.collection<User>(Collections.USERS).updateOne(
        { authSubject },
        {
            $inc: { transcriptionUsed: seconds },
            $set: { updatedAt: new Date() }
        }
    );
}

export interface RecordTranscriptionUsageInput {
    /** Provider that performed the transcription (drives the multiplier). */
    provider: TranscriptionProvider;
    /** Raw audio seconds (pre-rounding). */
    rawSeconds: number;
    recordingId?: string;
}

export interface UsageEvent {
    authSubject: string;
    type: 'transcription';
    provider: TranscriptionProvider;
    rawSeconds: number;
    billedSeconds: number;
    multiplier: number;
    billedUnits: number;
    recordingId?: string;
    createdAt: Date;
}

/**
 * Meter one transcription: round up to 15s blocks, apply the provider
 * multiplier, bump the user's counter, and append a usage_events ledger row.
 * The ledger is written in every profile (self-host included) so operators
 * can always see what was consumed; enforcement happens in access-control.
 */
export async function recordTranscriptionUsage(
    authSubject: string,
    input: RecordTranscriptionUsageInput,
): Promise<{ billedSeconds: number; multiplier: number; billedUnits: number }> {
    const billedSeconds = calculateBilledDuration(input.rawSeconds);
    const multiplier = transcriptionMultiplier(input.provider);
    const billedUnits = billedSeconds * multiplier;
    const db = await getMongoDb();

    await db.collection<User>(Collections.USERS).updateOne(
        { authSubject },
        {
            $inc: { transcriptionUsed: billedUnits },
            $set: { updatedAt: new Date() },
        },
    );
    await db.collection<UsageEvent>(Collections.USAGE_EVENTS).insertOne({
        authSubject,
        type: 'transcription',
        provider: input.provider,
        rawSeconds: input.rawSeconds,
        billedSeconds,
        multiplier,
        billedUnits,
        recordingId: input.recordingId,
        createdAt: new Date(),
    });

    return { billedSeconds, multiplier, billedUnits };
}

/**
 * Increment the user's contact count.
 */
export async function incrementContactCount(
    authSubject: string,
    count: number
): Promise<void> {
    const db = await getMongoDb();

    await db.collection<User>(Collections.USERS).updateOne(
        { authSubject },
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
    authSubject: string,
    change: { count: number; duration: number }
): Promise<void> {
    const db = await getMongoDb();

    await db.collection<User>(Collections.USERS).updateOne(
        { authSubject },
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
