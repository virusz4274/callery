import { getAuthSubjectFromSession } from './auth-utils';
import { findUserByAuthSubject } from '@/lib/db/users';

/**
 * Helper: Get current authenticated admin user from session.
 * Provider-agnostic: identity comes from the auth seam, the admin
 * flag from the app user record.
 */
export async function getCurrentAdmin() {
    try {
        const subject = await getAuthSubjectFromSession();
        if (!subject) return null;

        const admin = await findUserByAuthSubject(subject);

        if (!admin || admin.role !== 'admin') return null;
        return admin;
    } catch {
        return null;
    }
}
