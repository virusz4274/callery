import { getAuthSubjectFromSession } from '@/lib/auth-utils';
import { getMongoDb, Collections } from '@/lib/mongodb';
import { User } from '@/lib/db/types';
import { ObjectId } from 'mongodb';

export const UNAUTHORIZED_ERROR_MESSAGE = 'Unauthorized';

/**
 * Helper: Get current authenticated admin user from session.
 */
export async function getCurrentAdmin() {
    try {
        const subject = await getAuthSubjectFromSession();
        if (!subject) return null;
        const db = await getMongoDb();
        const admin = await db.collection<User>(Collections.USERS).findOne({ authSubject: subject });

        if (!admin || admin.role !== 'admin' || admin.disabled || admin.softDelete?.isDeleted) return null;
        return admin;
    } catch {
        return null;
    }
}

/**
 * Require an authenticated admin and throw if the request is not authorized.
 */
export async function requireCurrentAdmin(): Promise<User> {
    const admin = await getCurrentAdmin();
    if (!admin) {
        throw new Error(UNAUTHORIZED_ERROR_MESSAGE);
    }

    return admin;
}

/**
 * Parse and validate ObjectId input to keep action handlers consistent.
 */
export function parseObjectId(value: string, fieldName: string = 'id'): ObjectId {
    if (!ObjectId.isValid(value)) {
        throw new Error(`Invalid ${fieldName}`);
    }

    return new ObjectId(value);
}
