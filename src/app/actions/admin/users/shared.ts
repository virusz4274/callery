import { revalidatePath } from 'next/cache';
import type { User } from '@/lib/db/types';

export type InvoiceStatus = 'Paid' | 'Pending' | 'Failed';

function escapeRegex(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
    const normalizedSearch = search?.trim();
    if (!normalizedSearch) {
        return {};
    }

    const safePattern = escapeRegex(normalizedSearch.slice(0, 120));

    return {
        $or: [
            { email: { $regex: safePattern, $options: 'i' } },
            { name: { $regex: safePattern, $options: 'i' } },
            { firstName: { $regex: safePattern, $options: 'i' } },
            { lastName: { $regex: safePattern, $options: 'i' } },
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
        softDelete: user.softDelete
            ? {
                ...user.softDelete,
                deletedAt: user.softDelete.deletedAt.toISOString(),
                restoreUntil: user.softDelete.restoreUntil.toISOString(),
            }
            : undefined,
        stripeSubscriptionStatus: user.stripeSubscriptionStatus,
    };
}

export function revalidateAdminUsers(userId?: string) {
    revalidatePath('/admin/users');

    if (userId) {
        revalidatePath(`/admin/users/${userId}`);
    }
}
