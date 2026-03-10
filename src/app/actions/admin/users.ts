'use server';

import {
    deleteUserMutation,
    restoreUserMutation,
    toggleUserStatusMutation,
    updateUserLimitsMutation,
    updateUserRoleMutation,
    updateUserUsageMutation,
} from './users/mutations';
import { getUserByIdQuery, getUserInvoicesQuery, getUsersQuery } from './users/queries';

/**
 * Get paginated list of users with optional search.
 */
export async function getUsers(page: number = 1, limit: number = 10, search?: string) {
    return getUsersQuery(page, limit, search);
}

/**
 * Get a single user by ID (hex string).
 */
export async function getUserById(userId: string) {
    return getUserByIdQuery(userId);
}

export async function getUserInvoices(userId: string, limit: number = 20) {
    return getUserInvoicesQuery(userId, limit);
}

/**
 * Update user role.
 */
export async function updateUserRole(userId: string, role: 'user' | 'admin') {
    return updateUserRoleMutation(userId, role);
}

/**
 * Toggle user disabled status (Ban/Unban).
 */
export async function toggleUserStatus(userId: string, disabled: boolean) {
    return toggleUserStatusMutation(userId, disabled);
}

/**
 * Update user limits (Storage and Transcription).
 */
export async function updateUserLimits(
    userId: string,
    limits: { storageAllocation: number; transcriptionAllocation: number }
) {
    return updateUserLimitsMutation(userId, limits);
}

/**
 * Update user usage (Forgiveness/Adjustment).
 * Allows admins to manually set storageUsed and transcriptionUsed.
 */
export async function updateUserUsage(userId: string, usage: { storageUsed: number; transcriptionUsed: number }) {
    return updateUserUsageMutation(userId, usage);
}

/**
 * Soft delete a user and schedule permanent deletion after restore window.
 */
export async function deleteUser(userId: string) {
    return deleteUserMutation(userId);
}

/**
 * Restore a soft-deleted user within restore window.
 */
export async function restoreUser(userId: string) {
    return restoreUserMutation(userId);
}
