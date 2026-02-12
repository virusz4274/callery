'use server';

import { getMongoDb, Collections } from '@/lib/mongodb';
import { User, Recording } from '@/lib/db/types';
import { ObjectId } from 'mongodb';
import { revalidatePath } from 'next/cache';
import { deleteFromR2 } from '@/lib/r2';
import { logAdminAction } from '../audit-log';
import { getCurrentAdmin } from './auth';

/**
 * Get paginated list of users with optional search.
 */
export async function getUsers(
    page: number = 1,
    limit: number = 10,
    search?: string
) {
    const db = await getMongoDb();
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = {};
    if (search) {
        query.$or = [
            { email: { $regex: search, $options: 'i' } },
            { name: { $regex: search, $options: 'i' } },
            { firstName: { $regex: search, $options: 'i' } },
            { lastName: { $regex: search, $options: 'i' } }
        ];
    }

    const totalUsers = await db.collection(Collections.USERS).countDocuments(query);
    const users = await db.collection<User>(Collections.USERS)
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();

    // Serialize generic _id to string for client
    const serializedUsers = users.map(user => ({
        ...user,
        id: user._id.toString(),
        _id: undefined, // remove generic objectId
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
        lastLoginAt: user.lastLoginAt?.toISOString(),
        trialEndsAt: user.trialEndsAt?.toISOString(),
        stripeSubscriptionStatus: user.stripeSubscriptionStatus,
    }));

    return {
        users: serializedUsers,
        total: totalUsers,
        page,
        limit,
        totalPages: Math.ceil(totalUsers / limit)
    };
}

/**
 * Get a single user by ID (hex string).
 */
export async function getUserById(userId: string) {
    const db = await getMongoDb();

    try {
        const user = await db.collection<User>(Collections.USERS).findOne({
            _id: new ObjectId(userId)
        });

        if (!user) return null;

        return {
            ...user,
            id: user._id.toString(),
            _id: undefined,
            createdAt: user.createdAt.toISOString(),
            updatedAt: user.updatedAt.toISOString(),
            lastLoginAt: user.lastLoginAt?.toISOString(),
        };

    } catch (error) {
        console.error("Error fetching user:", error);
        return null;
    }
}

/**
 * Update user role.
 */
export async function updateUserRole(userId: string, role: 'user' | 'admin') {
    const db = await getMongoDb();
    const admin = await getCurrentAdmin();

    if (!admin) {
        throw new Error('Unauthorized');
    }

    await db.collection<User>(Collections.USERS).updateOne(
        { _id: new ObjectId(userId) },
        {
            $set: {
                role,
                updatedAt: new Date()
            }
        }
    );

    await logAdminAction(
        admin._id.toString(),
        'USER_ROLE_UPDATE',
        { role },
        userId,
        'USER'
    );

    revalidatePath('/admin/users');
}

/**
 * Toggle user disabled status (Ban/Unban).
 */
export async function toggleUserStatus(userId: string, disabled: boolean) {
    const db = await getMongoDb();
    const admin = await getCurrentAdmin();

    if (!admin) {
        throw new Error('Unauthorized');
    }

    await db.collection<User>(Collections.USERS).updateOne(
        { _id: new ObjectId(userId) },
        {
            $set: {
                disabled,
                updatedAt: new Date()
            }
        }
    );

    await logAdminAction(
        admin._id.toString(),
        disabled ? 'USER_BAN' : 'USER_UNBAN',
        { disabled },
        userId,
        'USER'
    );

    revalidatePath('/admin/users');
}

/**
 * Update user limits (Storage and Transcription).
 */
export async function updateUserLimits(
    userId: string,
    limits: { storageAllocation: number; transcriptionAllocation: number }
) {
    const db = await getMongoDb();
    const admin = await getCurrentAdmin();

    if (!admin) {
        throw new Error('Unauthorized');
    }

    // Get previous values for better logging
    const oldUser = await db.collection<User>(Collections.USERS).findOne({ _id: new ObjectId(userId) });

    await db.collection<User>(Collections.USERS).updateOne(
        { _id: new ObjectId(userId) },
        {
            $set: {
                storageAllocation: limits.storageAllocation,
                transcriptionAllocation: limits.transcriptionAllocation,
                updatedAt: new Date()
            }
        }
    );

    await logAdminAction(
        admin._id.toString(),
        'USER_LIMITS_UPDATE',
        {
            oldStorage: oldUser?.storageAllocation,
            newStorage: limits.storageAllocation,
            oldTranscription: oldUser?.transcriptionAllocation,
            newTranscription: limits.transcriptionAllocation
        },
        userId,
        'USER'
    );

    revalidatePath('/admin/users');
    revalidatePath(`/admin/users/${userId}`);
}

/**
 * Update user usage (Forgiveness/Adjustment).
 * Allows admins to manually set storageUsed and transcriptionUsed.
 */
export async function updateUserUsage(
    userId: string,
    usage: { storageUsed: number; transcriptionUsed: number }
) {
    const db = await getMongoDb();
    const admin = await getCurrentAdmin();

    if (!admin) {
        throw new Error('Unauthorized');
    }

    // Get previous values for audit log
    const oldUser = await db.collection<User>(Collections.USERS).findOne({ _id: new ObjectId(userId) });

    await db.collection<User>(Collections.USERS).updateOne(
        { _id: new ObjectId(userId) },
        {
            $set: {
                storageUsed: usage.storageUsed,
                transcriptionUsed: usage.transcriptionUsed,
                updatedAt: new Date()
            }
        }
    );

    await logAdminAction(
        admin._id.toString(),
        'USER_USAGE_UPDATE',
        {
            oldStorageUsed: oldUser?.storageUsed,
            newStorageUsed: usage.storageUsed,
            oldTranscriptionUsed: oldUser?.transcriptionUsed,
            newTranscriptionUsed: usage.transcriptionUsed
        },
        userId,
        'USER'
    );

    revalidatePath('/admin/users');
    revalidatePath(`/admin/users/${userId}`);
}

/**
 * Hard delete a user and all their associated data (Recordings, Contacts, R2 Files).
 * This is irreversible.
 */
export async function deleteUser(userId: string) {
    const db = await getMongoDb();
    const admin = await getCurrentAdmin();

    if (!admin) {
        throw new Error('Unauthorized');
    }

    const user = await db.collection<User>(Collections.USERS).findOne({ _id: new ObjectId(userId) });

    if (!user) {
        throw new Error('User not found');
    }

    // 1. Get all user recordings to delete files from R2
    const recordings = await db.collection<Recording>(Collections.RECORDINGS)
        .find({ firebaseUid: user.firebaseUid })
        .toArray();

    // 2. Delete files from R2 (in parallel)
    await Promise.all(recordings.map(async (rec) => {
        if (rec.r2Key) {
            try {
                await deleteFromR2(rec.r2Key);
            } catch (error) {
                console.error(`Failed to delete R2 file for recording ${rec._id}:`, error);
                // Continue identifying other resources even if one fails
            }
        }
    }));

    // 3. Delete Recordings from MongoDB
    await db.collection(Collections.RECORDINGS).deleteMany({ firebaseUid: user.firebaseUid });

    // 4. Delete Contacts from MongoDB
    await db.collection(Collections.CONTACTS).deleteMany({ firebaseUid: user.firebaseUid });

    // 5. Delete User from MongoDB
    await db.collection(Collections.USERS).deleteOne({ _id: new ObjectId(userId) });

    await logAdminAction(
        admin._id.toString(),
        'USER_DELETE',
        { deletedUserEmail: user.email, deletedUserId: userId },
        userId,
        'USER'
    );

    revalidatePath('/admin/users');
}
