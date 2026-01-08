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
        storageUsed: 0,
        storageAllocation,
        transcriptionUsed: 0,
        transcriptionAllocation,
        totalContacts: 0,
        totalRecordings: 0,
        totalDuration: 0,
        trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    });

    return { user: newUser, wasCreated: true };
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
