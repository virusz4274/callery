import { logAdminAction } from '@/app/actions/audit-log';
import { parseObjectId, requireCurrentAdmin } from '@/lib/admin-auth';
import { Recording, User } from '@/lib/db/types';
import { Collections, getMongoDb } from '@/lib/mongodb';
import { deleteFromR2 } from '@/lib/r2';
import { revalidateAdminUsers } from './shared';

export async function updateUserRoleMutation(userId: string, role: 'user' | 'admin') {
    const admin = await requireCurrentAdmin();

    const db = await getMongoDb();
    const userObjectId = parseObjectId(userId, 'userId');

    await db.collection<User>(Collections.USERS).updateOne(
        { _id: userObjectId },
        {
            $set: {
                role,
                updatedAt: new Date(),
            },
        }
    );

    await logAdminAction(admin._id.toString(), 'USER_ROLE_UPDATE', { role }, userId, 'USER');
    revalidateAdminUsers();
}

export async function toggleUserStatusMutation(userId: string, disabled: boolean) {
    const admin = await requireCurrentAdmin();

    const db = await getMongoDb();
    const userObjectId = parseObjectId(userId, 'userId');

    await db.collection<User>(Collections.USERS).updateOne(
        { _id: userObjectId },
        {
            $set: {
                disabled,
                updatedAt: new Date(),
            },
        }
    );

    await logAdminAction(
        admin._id.toString(),
        disabled ? 'USER_BAN' : 'USER_UNBAN',
        { disabled },
        userId,
        'USER'
    );

    revalidateAdminUsers();
}

export async function updateUserLimitsMutation(
    userId: string,
    limits: { storageAllocation: number; transcriptionAllocation: number }
) {
    const admin = await requireCurrentAdmin();

    const db = await getMongoDb();
    const userObjectId = parseObjectId(userId, 'userId');

    const oldUser = await db.collection<User>(Collections.USERS).findOne({ _id: userObjectId });

    await db.collection<User>(Collections.USERS).updateOne(
        { _id: userObjectId },
        {
            $set: {
                storageAllocation: limits.storageAllocation,
                transcriptionAllocation: limits.transcriptionAllocation,
                updatedAt: new Date(),
            },
        }
    );

    await logAdminAction(
        admin._id.toString(),
        'USER_LIMITS_UPDATE',
        {
            oldStorage: oldUser?.storageAllocation,
            newStorage: limits.storageAllocation,
            oldTranscription: oldUser?.transcriptionAllocation,
            newTranscription: limits.transcriptionAllocation,
        },
        userId,
        'USER'
    );

    revalidateAdminUsers(userId);
}

export async function updateUserUsageMutation(
    userId: string,
    usage: { storageUsed: number; transcriptionUsed: number }
) {
    const admin = await requireCurrentAdmin();

    const db = await getMongoDb();
    const userObjectId = parseObjectId(userId, 'userId');

    const oldUser = await db.collection<User>(Collections.USERS).findOne({ _id: userObjectId });

    await db.collection<User>(Collections.USERS).updateOne(
        { _id: userObjectId },
        {
            $set: {
                storageUsed: usage.storageUsed,
                transcriptionUsed: usage.transcriptionUsed,
                updatedAt: new Date(),
            },
        }
    );

    await logAdminAction(
        admin._id.toString(),
        'USER_USAGE_UPDATE',
        {
            oldStorageUsed: oldUser?.storageUsed,
            newStorageUsed: usage.storageUsed,
            oldTranscriptionUsed: oldUser?.transcriptionUsed,
            newTranscriptionUsed: usage.transcriptionUsed,
        },
        userId,
        'USER'
    );

    revalidateAdminUsers(userId);
}

export async function deleteUserMutation(userId: string) {
    const admin = await requireCurrentAdmin();

    const db = await getMongoDb();
    const userObjectId = parseObjectId(userId, 'userId');
    const user = await db.collection<User>(Collections.USERS).findOne({ _id: userObjectId });

    if (!user) {
        throw new Error('User not found');
    }

    const recordings = await db
        .collection<Recording>(Collections.RECORDINGS)
        .find({ firebaseUid: user.firebaseUid })
        .toArray();

    await Promise.all(
        recordings.map(async (recording) => {
            if (!recording.r2Key) {
                return;
            }

            try {
                await deleteFromR2(recording.r2Key);
            } catch (error) {
                console.error(`Failed to delete R2 file for recording ${recording._id}:`, error);
            }
        })
    );

    await db.collection(Collections.RECORDINGS).deleteMany({ firebaseUid: user.firebaseUid });
    await db.collection(Collections.CONTACTS).deleteMany({ firebaseUid: user.firebaseUid });
    await db.collection(Collections.USERS).deleteOne({ _id: userObjectId });

    await logAdminAction(
        admin._id.toString(),
        'USER_DELETE',
        { deletedUserEmail: user.email, deletedUserId: userId },
        userId,
        'USER'
    );

    revalidateAdminUsers();
}
