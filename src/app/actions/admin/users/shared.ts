import { revalidatePath } from 'next/cache';
import type { User } from '@/lib/db/types';

export type InvoiceStatus = 'Paid' | 'Pending' | 'Failed';

export function toInvoiceStatus(status: string | null): InvoiceStatus {
    if (status === 'paid') {
        return 'Paid';
    }

    if (status === 'void' || status === 'uncollectible') {
        return 'Failed';
    }

    return 'Pending';
}

export function buildUserSearchQuery(search?: string): Record<string, unknown> {
    if (!search) {
        return {};
    }

    return {
        $or: [
            { email: { $regex: search, $options: 'i' } },
            { name: { $regex: search, $options: 'i' } },
            { firstName: { $regex: search, $options: 'i' } },
            { lastName: { $regex: search, $options: 'i' } },
        ],
    };
}

export function serializeUser(user: User) {
    return {
        ...user,
        id: user._id.toString(),
        _id: undefined,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
        lastLoginAt: user.lastLoginAt?.toISOString(),
        trialEndsAt: user.trialEndsAt?.toISOString(),
        stripeSubscriptionStatus: user.stripeSubscriptionStatus,
    };
}

export function revalidateAdminUsers(userId?: string) {
    revalidatePath('/admin/users');

    if (userId) {
        revalidatePath(`/admin/users/${userId}`);
    }
}
