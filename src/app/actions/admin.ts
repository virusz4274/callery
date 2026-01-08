'use server';

import { getMongoDb, Collections } from '@/lib/mongodb';
import { User, Recording } from '@/lib/db/types';
import { ObjectId } from 'mongodb';
import { revalidatePath } from 'next/cache';
import { deleteFromR2 } from '@/lib/r2';

/**
 * Get system-wide statistics for the admin dashboard.
 */
export async function getSystemStats() {
    const db = await getMongoDb();

    const totalUsers = await db.collection(Collections.USERS).countDocuments();
    const totalRecordings = await db.collection(Collections.RECORDINGS).countDocuments();

    // Aggregate total usage
    const usageStats = await db.collection<User>(Collections.USERS).aggregate([
        {
            $group: {
                _id: null,
                totalStorageUsed: { $sum: '$storageUsed' },
                totalTranscriptionUsed: { $sum: '$transcriptionUsed' }
            }
        }
    ]).toArray();

    const { totalStorageUsed, totalTranscriptionUsed } = usageStats[0] || { totalStorageUsed: 0, totalTranscriptionUsed: 0 };

    return {
        totalUsers,
        totalRecordings,
        totalStorageUsed,
        totalTranscriptionUsed
    };
}

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

import { cookies } from 'next/headers';
import { getAuth } from 'firebase-admin/auth';
import { getFirebaseAdminApp } from '@/lib/firebase/admin';
import { logAdminAction } from './audit-log';

// Initialize Firebase Admin
getFirebaseAdminApp();

/**
 * Helper: Get current authenticated admin user from session.
 */
async function getCurrentAdmin() {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get('session');
        if (!sessionCookie?.value) return null;

        const decodedToken = await getAuth().verifySessionCookie(sessionCookie.value, true);
        const db = await getMongoDb();
        const admin = await db.collection<User>(Collections.USERS).findOne({ firebaseUid: decodedToken.uid });

        if (!admin || admin.role !== 'admin') return null;
        return admin;
    } catch {
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
 * Get all recordings for a specific user.
 */
export async function getUserRecordings(userId: string) {
    const db = await getMongoDb();

    // First get the user to find their firebaseUid
    const user = await db.collection<User>(Collections.USERS).findOne({
        _id: new ObjectId(userId)
    });

    if (!user) return [];

    const recordings = await db.collection(Collections.RECORDINGS)
        .find({ firebaseUid: user.firebaseUid })
        .sort({ recordedAt: -1 })
        .toArray();

    return recordings.map(rec => ({
        ...rec,
        id: rec._id.toString(),
        _id: undefined,
        contactId: rec.contactId ? rec.contactId.toString() : null, // Convert to string or null
        fullTranscript: rec.fullTranscript ? JSON.parse(JSON.stringify(rec.fullTranscript)) : undefined, // Deep cleanse for safety
        summaryEmbedding: undefined, // Don't send embeddings to client (too heavy/non-serializable usually)
        recordedAt: rec.recordedAt.toISOString(),
        createdAt: rec.createdAt.toISOString(),
        updatedAt: rec.updatedAt.toISOString(),
        // Explicitly pass other safe fields to allow '...' spread below if needed, or just let '...rec' handle primitives
        // but carefully override the dangerous ones above.
    }));
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

/**
 * Get count of orphaned recordings (recordings with no matching user).
 */
export async function getOrphanedRecordingsCount() {
    const db = await getMongoDb();

    // Find recordings where the firebaseUid does not exist in the users collection
    const orphans = await db.collection(Collections.RECORDINGS).aggregate([
        {
            $lookup: {
                from: Collections.USERS,
                localField: 'firebaseUid',
                foreignField: 'firebaseUid',
                as: 'user'
            }
        },
        {
            $match: {
                user: { $size: 0 }
            }
        },
        {
            $count: 'count'
        }
    ]).toArray();

    return orphans[0]?.count || 0;
}

/**
 * Cleanup orphaned recordings (delete from DB and R2).
 */
export async function cleanupOrphanedRecordings() {
    const db = await getMongoDb();

    // 1. Find orphans
    const orphans = await db.collection<Recording>(Collections.RECORDINGS).aggregate([
        {
            $lookup: {
                from: Collections.USERS,
                localField: 'firebaseUid',
                foreignField: 'firebaseUid',
                as: 'user'
            }
        },
        {
            $match: {
                user: { $size: 0 }
            }
        }
    ]).toArray();

    if (orphans.length === 0) return { deletedCount: 0 };

    // 2. Delete R2 files
    let deletedR2 = 0;
    await Promise.all(orphans.map(async (rec) => {
        if (rec.r2Key) {
            try {
                await deleteFromR2(rec.r2Key);
                deletedR2++;
            } catch (e) {
                console.error(`Failed to delete orphan R2 file ${rec.r2Key}`, e);
            }
        }
    }));

    // 3. Delete from MongoDB
    const orphanIds = orphans.map(o => o._id);
    const deleteResult = await db.collection(Collections.RECORDINGS).deleteMany({
        _id: { $in: orphanIds }
    });

    return {
        found: orphans.length,
        deletedDb: deleteResult.deletedCount,
        deletedR2
    };
}
