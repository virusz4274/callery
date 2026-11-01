'use client';

import { authFetchJson } from './api-client';
import type { UpdateProfileBody } from './schemas';

export const userProfileKey = (subject: string) => ['user-profile', subject] as const;

/** A successful write invalidates only its owner's cached profile. */
export async function saveUserProfile(
    subject: string,
    patch: UpdateProfileBody,
    revalidate: (key: ReturnType<typeof userProfileKey>) => Promise<unknown>,
) {
    if (!subject) throw new Error('Sign in before saving settings.');
    await authFetchJson<{ success: true }>('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
    });
    // A failed refresh does not undo a completed server write. SWR retains the
    // refresh error and can retry without incorrectly reporting a failed save.
    await revalidate(userProfileKey(subject)).catch(() => undefined);
}
