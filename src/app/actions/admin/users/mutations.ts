import { AdminLimitsSchema, AdminUsageSchema, validationFailure } from '@/lib/admin-validation';
import { logAdminAction } from '@/app/actions/audit-log';
import { parseObjectId, requireCurrentAdmin } from '@/lib/admin-auth';
import { User } from '@/lib/db/types';
import { Collections, getMongoDb } from '@/lib/mongodb';
import { buildRestoreDeadline, hardDeleteUserData } from '@/lib/db/users/soft-delete';
import { revalidateAdminUsers } from './shared';
import { getTeamSettings, withTeamAccessLock, assertNotLastAdmin, revokeUserSessions } from '@/lib/team-policy';

export async function updateUserRoleMutation(userId: string, role: 'user' | 'admin') {
    if (!['user', 'admin'].includes(role)) throw new Error('Invalid role');
    await requireCurrentAdmin();
    return withTeamAccessLock(() => updateUserRoleUnlocked(userId, role));
}

export async function toggleUserStatusMutation(userId: string, disabled: boolean) {
    if (typeof disabled !== 'boolean') throw new Error('Invalid status');
    await requireCurrentAdmin();
    return withTeamAccessLock(() => toggleUserStatusUnlocked(userId, disabled));
}

export async function deleteUserMutation(userId: string) {
    await requireCurrentAdmin();
    return withTeamAccessLock(async () => {
        if ((await getTeamSettings()).enabled) return toggleUserStatusUnlocked(userId, true);
        return deleteUserUnlocked(userId);
    });
}

export async function restoreUserMutation(userId: string) {
    await requireCurrentAdmin();
    return withTeamAccessLock(async () => {
        if ((await getTeamSettings()).enabled) return toggleUserStatusUnlocked(userId, false);
        return restoreUserUnlocked(userId);
    });
}

async function updateUserRoleUnlocked(userId: string, role: 'user' | 'admin') {
    const admin = await requireCurrentAdmin();

    const db = await getMongoDb();
    const userObjectId = parseObjectId(userId, 'userId');
    if ((await getTeamSettings()).enabled) {
        const user = await db.collection<User>(Collections.USERS).findOne({ _id: userObjectId });
        if (!user || user.teamInvitationPending) throw new Error('Employee must verify their invitation first.');
        if (role !== 'admin') await assertNotLastAdmin(user);
    }

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

async function toggleUserStatusUnlocked(userId: string, disabled: boolean) {
    const admin = await requireCurrentAdmin();

    const db = await getMongoDb();
    const userObjectId = parseObjectId(userId, 'userId');
    const user = await db.collection<User>(Collections.USERS).findOne({ _id: userObjectId });
    if (!user) throw new Error('User not found');
    if ((await getTeamSettings()).enabled && disabled) await assertNotLastAdmin(user);

    await db.collection<User>(Collections.USERS).updateOne(
        { _id: userObjectId },
        {
            $set: {
                disabled,
                ...(disabled ? { accessRevokedAt: new Date() } : {}),
                updatedAt: new Date(),
            },
        }
    );

    if (disabled) await revokeUserSessions(user.authSubject);

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
    const validation = AdminLimitsSchema.safeParse(limits);
    if (!validation.success) return validationFailure(validation.error);


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
    const validation = AdminUsageSchema.safeParse(usage);
    if (!validation.success) return validationFailure(validation.error);


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

async function deleteUserUnlocked(userId: string) {
    const admin = await requireCurrentAdmin();

    const db = await getMongoDb();
    const userObjectId = parseObjectId(userId, 'userId');
    const user = await db.collection<User>(Collections.USERS).findOne({ _id: userObjectId });

    if (!user) {
        throw new Error('User not found');
    }

    if (user.softDelete?.isDeleted) {
        throw new Error('User is already scheduled for deletion');
    }

    const now = new Date();
    const restoreUntil = buildRestoreDeadline(now);

    await db.collection<User>(Collections.USERS).updateOne(
        { _id: userObjectId },
        {
            $set: {
                disabled: true,
                softDelete: {
                    isDeleted: true,
                    deletedAt: now,
                    restoreUntil,
                    previousDisabled: user.disabled || false,
                    deletedByAdminId: admin._id.toString(),
                },
                updatedAt: now,
            },
        }
    );

    await logAdminAction(
        admin._id.toString(),
        'USER_SOFT_DELETE',
        {
            deletedUserEmail: user.email,
            deletedUserId: userId,
            restoreUntil: restoreUntil.toISOString(),
        },
        userId,
        'USER'
    );

    revalidateAdminUsers();
}

async function restoreUserUnlocked(userId: string) {
    const admin = await requireCurrentAdmin();
    const db = await getMongoDb();
    const userObjectId = parseObjectId(userId, 'userId');

    const user = await db.collection<User>(Collections.USERS).findOne({ _id: userObjectId });
    if (!user) {
        throw new Error('User not found');
    }

    if (!user.softDelete?.isDeleted) {
        throw new Error('User is not deleted');
    }

    const now = new Date();
    if (now > user.softDelete.restoreUntil) {
        // Window expired: hard-delete immediately to keep state consistent.
        const cleanup = await hardDeleteUserData(db, user, true);
        if (!cleanup.completed) throw new Error('Cleanup is pending; storage records were retained for retry.');
        await logAdminAction(
            admin._id.toString(),
            'USER_HARD_DELETE',
            {
                deletedUserEmail: user.email,
                deletedUserId: userId,
                reason: 'Restore window expired',
            },
            userId,
            'USER'
        );
        revalidateAdminUsers();
        throw new Error('Restore window expired; user was permanently deleted');
    }

    await db.collection<User>(Collections.USERS).updateOne(
        { _id: userObjectId },
        {
            $set: {
                disabled: user.softDelete.previousDisabled,
                updatedAt: now,
            },
            $unset: {
                softDelete: '',
            },
        }
    );

    await logAdminAction(
        admin._id.toString(),
        'USER_RESTORE',
        {
            restoredUserEmail: user.email,
            restoredUserId: userId,
        },
        userId,
        'USER'
    );

    revalidateAdminUsers(userId);
}
