'use server';

import {
    getCurrentAdmin as getCurrentAdminFromLib,
    requireCurrentAdmin as requireCurrentAdminFromLib,
} from '@/lib/admin-auth';

export async function getCurrentAdmin() {
    return getCurrentAdminFromLib();
}

export async function requireCurrentAdmin() {
    return requireCurrentAdminFromLib();
}
