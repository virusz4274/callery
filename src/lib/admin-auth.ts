import { cookies } from 'next/headers';
import { getAdminAuth } from '@/lib/firebase/admin';
import { getMongoDb, Collections } from '@/lib/mongodb';
import { User } from '@/lib/db/types';

/**
 * Helper: Get current authenticated admin user from session.
 */
export async function getCurrentAdmin() {
    try {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get('session');
        if (!sessionCookie?.value) return null;

        const auth = getAdminAuth();
        const decodedToken = await auth.verifySessionCookie(sessionCookie.value, true);
        const db = await getMongoDb();
        const admin = await db.collection<User>(Collections.USERS).findOne({ firebaseUid: decodedToken.uid });

        if (!admin || admin.role !== 'admin') return null;
        return admin;
    } catch {
        return null;
    }
}
